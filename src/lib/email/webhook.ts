import { createHmac, timingSafeEqual } from "crypto";

/**
 * Checking that a webhook really comes from Resend (signed by Svix with
 * `RESEND_WEBHOOK_SECRET`, a `whsec_…` value): an HMAC-SHA256 of
 * `id.timestamp.body` under the secret, matching any of the `v1,` signatures
 * sent, within five minutes of its timestamp (so an old one can't be
 * replayed). Pure apart from the clock.
 */

const TOLERANCE_SECONDS = 5 * 60;

export function signWebhook(secret: string, id: string, timestamp: string, body: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", new Uint8Array(key))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

export function verifyWebhook(
  secret: string | undefined,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now()
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const seconds = Number(headers.timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS) return false;
  const expected = new Uint8Array(
    Buffer.from(signWebhook(secret, headers.id, headers.timestamp, body))
  );
  return headers.signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = new Uint8Array(Buffer.from(value));
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
