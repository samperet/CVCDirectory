import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { CommunityUser, getUser } from "./users";

/**
 * Session cookies are `userId.expiresAtMs.hmac` signed with AUTH_SECRET.
 * Identity here is intentionally lightweight — picking a name signs you in —
 * so the cookie only guards against casual tampering, not determined attack.
 * Set AUTH_SECRET in production so sessions survive across deployments and
 * cannot be forged with the public fallback secret.
 */

const SESSION_COOKIE = "cvc_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;

function secret() {
  return process.env.AUTH_SECRET ?? "cvc-directory-insecure-dev-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionValue(userId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionValue(value: string | undefined): string | null {
  if (!value) return null;
  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = value.slice(0, lastDot);
  const signature = value.slice(lastDot + 1);
  const expected = sign(payload);
  const a = new Uint8Array(Buffer.from(signature));
  const b = new Uint8Array(Buffer.from(expected));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [userId, expiresAtRaw] = payload.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return userId;
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export async function getSessionUser(): Promise<CommunityUser | null> {
  const userId = parseSessionValue(cookies().get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return getUser(userId);
}
