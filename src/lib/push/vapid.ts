import webpush from "web-push";
import { enqueue, isPersistent, readJson, writeJson, writeJsonDurable } from "@/lib/storage";

/**
 * The VAPID key pair that identifies this app to browsers' push services.
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY take precedence; otherwise a pair is
 * generated once and kept in the shared store, so every server instance —
 * and every future deploy — signs with the same keys. (Changing keys would
 * silently break every device's subscription.)
 */

type Keys = { publicKey: string; privateKey: string };
const KEY = "push/vapid.json";
let cached: Keys | null = null;

const isKeys = (value: unknown): value is Keys =>
  !!value &&
  typeof (value as Keys).publicKey === "string" &&
  typeof (value as Keys).privateKey === "string";

export async function vapidKeys(): Promise<Keys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (cached) return cached;
  cached = await enqueue(KEY, async () => {
    const stored = await readJson(KEY);
    if (isKeys(stored)) return stored;
    const generated = webpush.generateVAPIDKeys();
    // Keys must survive: in production write only to R2, never the ephemeral fallback.
    if (isPersistent()) await writeJsonDurable(KEY, generated);
    else await writeJson(KEY, generated);
    // If another instance generated a pair at the same moment, use whichever was stored.
    const settled = await readJson(KEY);
    return isKeys(settled) ? settled : generated;
  });
  return cached;
}

/** Who to contact about this app's push traffic (required by push services). */
export function vapidSubject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "cvc-directory.vercel.app";
  return `https://${host}`;
}
