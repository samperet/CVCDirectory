import { promises as fs } from "fs";
import path from "path";
import { PROVIDERS, releaseQuota, reserveQuota, type Provider, type QuotaUse } from "./quota";

/**
 * Handing emails to the providers, cheapest-to-lose first: Brevo
 * (`BREVO_KEY`, 300 a day free) and then Resend (`RESEND_KEY`, 100 a day).
 * Each email takes room in one provider's free allowance; whatever a
 * provider has no room for, or fails to take, is offered to the next one —
 * so an outage or a used-up day at Brevo falls over to Resend, and only what
 * fits nowhere comes back as `overQuota` (for the morning summary). A
 * provider that refuses our key is skipped for the rest of the sending.
 * Resend takes batches of 100 (a batch refused for one bad address is split
 * and sent one by one); Brevo takes one email per request. Never throws;
 * failures are logged by kind and count only. Locally, `EMAIL_TEST_SINK`
 * (ignored on Vercel) writes the emails to `.data/email-sink.json` instead,
 * as if both providers were set up; `EMAIL_TEST_FAIL=brevo` makes one fail.
 */

const RESEND_BATCH = "https://api.resend.com/emails/batch";
const RESEND_ONE = "https://api.resend.com/emails";
const BREVO = "https://api.brevo.com/v3/smtp/email";
const BATCH = 100;
const BREVO_AT_ONCE = 5;

export interface Outgoing {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Defaults to `fromAddress()`. */
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

const sinkPath = () =>
  process.env.EMAIL_TEST_SINK && !process.env.VERCEL
    ? path.join(process.cwd(), ".data", "email-sink.json")
    : null;

const KEYS: Record<Provider, () => string | undefined> = {
  brevo: () => process.env.BREVO_KEY,
  resend: () => process.env.RESEND_KEY,
};

/** Whether a provider can be used (always, in the local sink). */
export const providerConfigured = (provider: Provider) => sinkPath() !== null || !!KEYS[provider]();

/** Whether email can be sent at all. */
export const emailConfigured = () => PROVIDERS.some(providerConfigured);

export const fromAddress = () =>
  process.env.EMAIL_FROM ?? "Common Pastures <notifications@commonpasturesvt.org>";

/** The domain the circles' group addresses are on. */
export const mailDomain = () => process.env.GROUP_EMAIL_DOMAIN ?? "commonpasturesvt.org";

export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );

/** `"Name" <address>` (or a bare address) as its parts. */
export function splitAddress(value: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^<>\s]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = match[1]
    .replace(/^"(.*)"$/, "$1")
    .replace(/\\(.)/g, "$1")
    .trim();
  return name ? { name, email: match[2] } : { email: match[2] };
}

const toResend = (message: Outgoing) => ({
  from: message.from ?? fromAddress(),
  to: [message.to],
  subject: message.subject,
  text: message.text,
  html: message.html,
  ...(message.replyTo ? { reply_to: message.replyTo } : {}),
  ...(message.headers ? { headers: message.headers } : {}),
});

export const toBrevo = (message: Outgoing) => ({
  sender: splitAddress(message.from ?? fromAddress()),
  to: [{ email: message.to }],
  subject: message.subject,
  htmlContent: message.html,
  textContent: message.text,
  ...(message.replyTo ? { replyTo: splitAddress(message.replyTo) } : {}),
  ...(message.headers ? { headers: message.headers } : {}),
});

async function post(url: string, headers: Record<string, string>, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : "error");

/** Which of `messages` (by index) Resend didn't take. */
async function viaResend(messages: Outgoing[], key: string, idempotencyKey?: string) {
  const failed: number[] = [];
  const auth = { Authorization: `Bearer ${key}` };
  for (let start = 0; start < messages.length; start += BATCH) {
    const batch = messages.slice(start, start + BATCH);
    const indexes = batch.map((_, offset) => start + offset);
    const batchKey = idempotencyKey ? `${idempotencyKey}/${start / BATCH}` : undefined;
    try {
      const response = await post(
        RESEND_BATCH,
        { ...auth, ...(batchKey ? { "Idempotency-Key": batchKey.slice(0, 256) } : {}) },
        batch.map(toResend)
      );
      // 409: this exact batch was already sent (a retry).
      if (response.ok || response.status === 409) continue;
      if (response.status === 422 && batch.length > 1) {
        // One bad address can refuse the whole batch: send each on its own.
        for (const index of indexes) {
          const one = await post(RESEND_ONE, auth, toResend(messages[index])).catch(() => null);
          if (!one?.ok) failed.push(index);
        }
        continue;
      }
      failed.push(...indexes);
      console.error("[email] Resend refused a batch", response.status, batch.length);
    } catch (error) {
      failed.push(...indexes);
      console.error("[email] Resend sending failed", errorName(error));
    }
  }
  return failed;
}

/** Which of `messages` (by index) Brevo didn't take. */
async function viaBrevo(messages: Outgoing[], key: string) {
  const failed: number[] = [];
  let refused = false;
  for (let start = 0; start < messages.length; start += BREVO_AT_ONCE) {
    const indexes = messages.slice(start, start + BREVO_AT_ONCE).map((_, offset) => start + offset);
    if (refused) {
      failed.push(...indexes);
      continue;
    }
    await Promise.all(
      indexes.map(async (index) => {
        try {
          const response = await post(BREVO, { "api-key": key }, toBrevo(messages[index]));
          if (response.ok) return;
          failed.push(index);
          // The key, the account or its credits: no use trying the rest.
          if ([401, 402, 403].includes(response.status)) refused = true;
          console.error("[email] Brevo refused an email", response.status);
        } catch (error) {
          failed.push(index);
          console.error("[email] Brevo sending failed", errorName(error));
        }
      })
    );
  }
  return failed.sort((a, b) => a - b);
}

async function viaSink(sink: string, provider: Provider, messages: Outgoing[]) {
  const failing = (process.env.EMAIL_TEST_FAIL ?? "").split(",").map((entry) => entry.trim());
  if (failing.includes(provider)) return messages.map((_, index) => index);
  const earlier = JSON.parse(await fs.readFile(sink, "utf8").catch(() => "[]")) as unknown[];
  const at = new Date().toISOString();
  await fs.mkdir(path.dirname(sink), { recursive: true });
  await fs.writeFile(
    sink,
    JSON.stringify(
      [
        ...earlier,
        ...messages.map((message) => ({
          at,
          provider,
          ...message,
          from: message.from ?? fromAddress(),
        })),
      ],
      null,
      1
    )
  );
  return [];
}

function via(provider: Provider, messages: Outgoing[], idempotencyKey?: string) {
  const sink = sinkPath();
  if (sink) return viaSink(sink, provider, messages);
  const key = KEYS[provider]()!;
  return provider === "brevo"
    ? viaBrevo(messages, key)
    : viaResend(messages, key, idempotencyKey && `${idempotencyKey}/${provider}`);
}

export interface Sending {
  sent: number;
  /** Tried and not taken by any provider. */
  failed: number;
  /** Indexes of the emails no provider had room for today — never tried. */
  overQuota: number[];
  /** How many each provider took. */
  by: Partial<Record<Provider, number>>;
}

/**
 * Send `messages`, each through the first provider with room that takes it.
 * `use` decides how much of each day's allowance it may have (see quota.ts);
 * `idempotencyKey` (per sending) makes a retry a no-op where the provider
 * supports it; `only` limits it to one provider (the admin's test).
 */
export async function sendEmails(
  messages: Outgoing[],
  use: Exclude<QuotaUse, "inbound">,
  idempotencyKey?: string,
  only?: Provider
): Promise<Sending> {
  const result: Sending = { sent: 0, failed: 0, overQuota: [], by: {} };
  let waiting = messages.map((_, index) => index);
  const tried = new Set<number>();
  for (const provider of PROVIDERS.filter(
    (entry) => providerConfigured(entry) && (!only || entry === only)
  )) {
    if (!waiting.length) break;
    try {
      const granted = await reserveQuota(provider, waiting.length, use);
      const now = waiting.slice(0, granted);
      if (!now.length) continue;
      const failed = await via(
        provider,
        now.map((index) => messages[index]),
        idempotencyKey
      );
      await releaseQuota(provider, failed.length);
      now.forEach((index) => tried.add(index));
      const taken = now.length - failed.length;
      if (taken) result.by[provider] = taken;
      result.sent += taken;
      waiting = [...failed.map((offset) => now[offset]), ...waiting.slice(granted)];
    } catch (error) {
      console.error("[email] sending through a provider failed", provider, errorName(error));
    }
  }
  result.failed = waiting.filter((index) => tried.has(index)).length;
  result.overQuota = waiting.filter((index) => !tried.has(index));
  return result;
}
