import { promises as fs } from "fs";
import path from "path";

/**
 * Handing emails to Resend (`RESEND_KEY`): in batches of up to 100, each
 * message with its own sender, Reply-To, and headers. A batch that Resend
 * refuses because of one bad address is split and sent one by one, so one
 * typo never stops the rest. Never throws; failures are logged by kind and
 * count only. Locally, `EMAIL_TEST_SINK` (ignored on Vercel) writes the
 * emails to `.data/email-sink.json` instead of sending them.
 */

const RESEND_BATCH = "https://api.resend.com/emails/batch";
const RESEND_ONE = "https://api.resend.com/emails";
const BATCH = 100;

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

/** Whether email can be sent at all. */
export const emailConfigured = () => !!process.env.RESEND_KEY || sinkPath() !== null;

export const fromAddress = () =>
  process.env.EMAIL_FROM ?? "Common Pastures <notifications@commonpasturesvt.org>";

/** The domain the circles' group addresses are on. */
export const mailDomain = () => process.env.GROUP_EMAIL_DOMAIN ?? "commonpasturesvt.org";

export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );

const toResend = (message: Outgoing) => ({
  from: message.from ?? fromAddress(),
  to: [message.to],
  subject: message.subject,
  text: message.text,
  html: message.html,
  ...(message.replyTo ? { reply_to: message.replyTo } : {}),
  ...(message.headers ? { headers: message.headers } : {}),
});

async function post(url: string, key: string, body: unknown, idempotencyKey?: string) {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Send, in batches; how many went and how many didn't. `idempotencyKey`
 * (per sending) makes a retry of the same batch a no-op at Resend.
 */
export async function deliver(
  messages: Outgoing[],
  idempotencyKey?: string
): Promise<{ sent: number; failed: number }> {
  if (!messages.length) return { sent: 0, failed: 0 };
  const sink = sinkPath();
  if (sink) {
    const earlier = JSON.parse(await fs.readFile(sink, "utf8").catch(() => "[]")) as unknown[];
    const at = new Date().toISOString();
    await fs.mkdir(path.dirname(sink), { recursive: true });
    await fs.writeFile(
      sink,
      JSON.stringify(
        [
          ...earlier,
          ...messages.map((message) => ({ at, ...message, from: toResend(message).from })),
        ],
        null,
        1
      )
    );
    return { sent: messages.length, failed: 0 };
  }
  const key = process.env.RESEND_KEY;
  if (!key) return { sent: 0, failed: messages.length };
  let sent = 0;
  let failed = 0;
  for (let start = 0; start < messages.length; start += BATCH) {
    const batch = messages.slice(start, start + BATCH);
    const batchKey = idempotencyKey ? `${idempotencyKey}/${start / BATCH}` : undefined;
    try {
      const response = await post(RESEND_BATCH, key, batch.map(toResend), batchKey);
      // 409: this exact batch was already sent (a retry).
      if (response.ok || response.status === 409) {
        sent += batch.length;
        continue;
      }
      if (response.status === 422 && batch.length > 1) {
        // One bad address can refuse the whole batch: send each on its own.
        for (const message of batch) {
          const one = await post(RESEND_ONE, key, toResend(message)).catch(() => null);
          if (one?.ok) sent++;
          else failed++;
        }
        continue;
      }
      failed += batch.length;
      console.error("[email] Resend refused a batch", response.status, batch.length);
    } catch (error) {
      failed += batch.length;
      console.error("[email] sending failed", error instanceof Error ? error.name : "error");
    }
  }
  return { sent, failed };
}
