import { createCipheriv, createDecipheriv, createHash, createSecretKey, randomBytes } from "crypto";
import { authSecret } from "@/lib/auth/secret";

/**
 * Residents' storage keys, kept encrypted (AES-256-GCM, with a key made from
 * the app's AUTH_SECRET) — so a backup of CVC, or anyone reading its
 * storage, never holds them in the clear. Feed tokens are kept only as a
 * hash.
 */

const key = () =>
  createSecretKey(
    new Uint8Array(createHash("sha256").update(`backup-storage:${authSecret()}`).digest())
  );
const bytes = (data: Buffer) => new Uint8Array(data);

export function seal(text: string): string {
  const iv = bytes(randomBytes(12));
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([bytes(cipher.update(text, "utf8")), bytes(cipher.final())]);
  return [Buffer.from(iv), cipher.getAuthTag(), body]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function unseal(sealed: string): string | null {
  try {
    const [iv, tag, body] = sealed.split(".").map((part) => bytes(Buffer.from(part, "base64url")));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([bytes(decipher.update(body)), bytes(decipher.final())]).toString("utf8");
  } catch {
    return null;
  }
}

/** A new feed token (shown once), and the hash that's kept. */
export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
