import { promises as fs } from "fs";
import path from "path";
import { headerMap, type Headers } from "@/lib/groups/classify";

/**
 * An email that arrived at the community's domain, fetched from Resend's
 * receiving API by its id (the webhook only says it came). Normalised to
 * what the group pipeline needs. Locally, with `EMAIL_TEST_SINK` (ignored
 * on Vercel), it's read from `.data/inbound-fixtures/<id>.json` instead.
 */

export interface ReceivedEmail {
  id: string;
  from: { email: string; name: string };
  to: string[];
  cc: string[];
  /** The addresses it was delivered for (our domain's, including plus tags). */
  receivedFor: string[];
  subject: string;
  text: string;
  html: string;
  headers: Headers;
  messageId: string | null;
  /** Message ids it replies to (In-Reply-To and References). */
  refs: string[];
  attachments: number;
  authentication: { dmarc?: unknown; dkim?: unknown; spf?: unknown } | null;
}

const fixtureDir = () =>
  process.env.EMAIL_TEST_SINK && !process.env.VERCEL
    ? path.join(process.cwd(), ".data", "inbound-fixtures")
    : null;

/** "Ada Ash <ada@example.org>" → its parts. */
export function parseAddress(value: unknown): { email: string; name: string } {
  if (value && typeof value === "object") {
    const entry = value as { email?: string; address?: string; name?: string };
    return {
      email: (entry.email ?? entry.address ?? "").toLowerCase().trim(),
      name: entry.name?.trim() ?? "",
    };
  }
  const text = String(value ?? "").trim();
  const angle = /^(.*)<([^>]+)>\s*$/.exec(text);
  if (angle)
    return { email: angle[2].toLowerCase().trim(), name: angle[1].replace(/^"|"$/g, "").trim() };
  return { email: text.toLowerCase(), name: "" };
}

const list = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value ? String(value).split(",") : [])
    .map((entry) => parseAddress(entry).email)
    .filter(Boolean);

const ids = (value: string | undefined) => (value ?? "").match(/<[^>\s]+>/g) ?? [];

export function normalizeReceived(id: string, raw: Record<string, unknown>): ReceivedEmail {
  const headers = headerMap(raw.headers);
  return {
    id,
    from: parseAddress(raw.from ?? headers["from"]),
    to: list(raw.to ?? headers["to"]),
    cc: list(raw.cc ?? headers["cc"]),
    receivedFor: list(raw.received_for ?? raw.receivedFor),
    subject: String(raw.subject ?? headers["subject"] ?? ""),
    text: String(raw.text ?? ""),
    html: String(raw.html ?? ""),
    headers,
    messageId: (raw.message_id as string) ?? headers["message-id"] ?? null,
    refs: Array.from(new Set([...ids(headers["in-reply-to"]), ...ids(headers["references"])])),
    attachments: Array.isArray(raw.attachments) ? raw.attachments.length : 0,
    authentication: (raw.authentication as ReceivedEmail["authentication"]) ?? null,
  };
}

/** The email, or null if it can't be fetched (yet). */
export async function fetchReceived(id: string): Promise<ReceivedEmail | null> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null;
  const dir = fixtureDir();
  if (dir) {
    const raw = await fs.readFile(path.join(dir, `${id}.json`), "utf8").catch(() => null);
    return raw ? normalizeReceived(id, JSON.parse(raw)) : null;
  }
  const key = process.env.RESEND_KEY;
  if (!key) return null;
  try {
    const response = await fetch(`https://api.resend.com/emails/receiving/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("[email] couldn't fetch a received email", response.status);
      return null;
    }
    const body = (await response.json()) as Record<string, unknown>;
    return normalizeReceived(id, (body.data as Record<string, unknown>) ?? body);
  } catch (error) {
    console.error(
      "[email] fetching a received email failed",
      error instanceof Error ? error.name : "error"
    );
    return null;
  }
}
