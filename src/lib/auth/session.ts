import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { CommunityUser, getUser, getUserForPerson } from "./users";
import { SESSION_COOKIE, VIEW_AS_COOKIE, authSecret } from "./secret";
import { isAdmin } from "./admins";
import { readDirectory } from "@/lib/directory/store";

/**
 * Session cookies are `userId.expiresAtMs.hmac` signed with AUTH_SECRET, and
 * are issued only after a resident signs in with their phone number. Set
 * AUTH_SECRET in production so sessions cannot be forged with the public
 * fallback secret. The edge middleware verifies the same format.
 */

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;

function sign(payload: string) {
  return createHmac("sha256", authSecret()).update(payload).digest("hex");
}

export function createSessionValue(userId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionValue(value: string | undefined): string | null {
  if (!value) return null;
  try {
    authSecret();
  } catch {
    return null; // no signing key configured: nobody is signed in
  }
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

/** The account that actually signed in, ignoring any "view as". */
export async function getRealSessionUser(): Promise<CommunityUser | null> {
  const userId = parseSessionValue(cookies().get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await getUser(userId);
  // Sessions from the retired name-only sign-in don't count: only accounts
  // linked to a resident (proven by phone number) are signed in.
  return user?.personId ? user : null;
}

/*
 * "View as": an admin can see the app as another resident does. A separate
 * signed cookie names the admin's account and the resident; it only counts
 * alongside that admin's own session, expires after an hour, and while it's
 * set the middleware refuses every change, so viewing is read-only.
 */

const VIEW_AS_TTL_MS = 60 * 60 * 1000;
const signViewAs = (payload: string) => sign(`view-as:${payload}`);

export function createViewAsValue(adminUserId: string, personId: string): string {
  const payload = `${adminUserId}.${personId}.${Date.now() + VIEW_AS_TTL_MS}`;
  return `${payload}.${signViewAs(payload)}`;
}

function parseViewAsValue(
  value: string | undefined
): { adminUserId: string; personId: string } | null {
  if (!value) return null;
  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = value.slice(0, lastDot);
  let expected: string;
  try {
    expected = signViewAs(payload);
  } catch {
    return null;
  }
  const a = new Uint8Array(Buffer.from(value.slice(lastDot + 1)));
  const b = new Uint8Array(Buffer.from(expected));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [adminUserId, personId, expiresAtRaw] = payload.split(".");
  if (!adminUserId || !personId || !(Number(expiresAtRaw) > Date.now())) return null;
  return { adminUserId, personId };
}

export function viewAsCookieOptions() {
  return {
    ...sessionCookieOptions(),
    name: VIEW_AS_COOKIE,
    maxAge: Math.floor(VIEW_AS_TTL_MS / 1000),
  };
}

/** If an admin is viewing as a resident: the admin, and the resident's account as they'd see the app. */
export async function getViewAs(): Promise<{ admin: CommunityUser; user: CommunityUser } | null> {
  const view = parseViewAsValue(cookies().get(VIEW_AS_COOKIE)?.value);
  if (!view) return null;
  const admin = await getRealSessionUser();
  if (!admin || admin.id !== view.adminUserId || !isAdmin(admin)) return null;
  const existing = await getUserForPerson(view.personId);
  if (existing) return { admin, user: existing };
  // They haven't signed in yet, so they have no account: stand in for one.
  const person = (await readDirectory())?.people.find((entry) => entry.id === view.personId);
  if (!person) return null;
  return {
    admin,
    user: {
      id: `view-as-${person.id}`,
      personId: person.id,
      name: person.displayName,
      createdAt: new Date(0).toISOString(),
    },
  };
}

/** The signed-in resident — or, while an admin is viewing as someone, that resident. */
export async function getSessionUser(): Promise<CommunityUser | null> {
  const viewAs = await getViewAs();
  if (viewAs) return viewAs.user;
  return getRealSessionUser();
}
