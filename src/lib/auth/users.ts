import { createHash, randomBytes, randomUUID } from "crypto";
import { enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * Community user registry. Every account belongs to a resident in the
 * directory (linked by personId) and is created on that resident's first
 * sign-in with their phone number. Verifying an email via magic link earns
 * the account a verified badge.
 */

export interface CommunityUser {
  id: string;
  /** The directory resident this account belongs to; null for legacy name-only accounts. */
  personId?: string | null;
  name: string;
  email: string | null;
  verified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  pendingVerification: {
    tokenHash: string;
    email: string;
    expiresAt: string;
  } | null;
}

export interface PublicUser {
  id: string;
  name: string;
  verified: boolean;
}

const USERS_KEY = "auth/users.json";
const TOKEN_TTL_MS = 30 * 60 * 1000;

function normalizeUsers(raw: unknown): CommunityUser[] {
  const doc = (raw ?? {}) as { users?: unknown };
  if (!Array.isArray(doc.users)) return [];
  return doc.users.filter(
    (user): user is CommunityUser =>
      !!user && typeof (user as CommunityUser).id === "string" && typeof (user as CommunityUser).name === "string"
  );
}

async function readUsers(): Promise<CommunityUser[]> {
  return normalizeUsers(await readJson(USERS_KEY));
}

async function mutateUsers<T>(mutate: (users: CommunityUser[]) => { users: CommunityUser[]; result: T }): Promise<T> {
  return enqueue(USERS_KEY, async () => {
    const users = normalizeUsers(await readJson(USERS_KEY));
    const { users: updated, result } = mutate(users);
    await writeJson(USERS_KEY, { users: updated });
    return result;
  });
}

export function toPublicUser(user: CommunityUser): PublicUser {
  return { id: user.id, name: user.name, verified: user.verified };
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await readUsers();
  return users
    .map(toPublicUser)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function getUser(id: string): Promise<CommunityUser | null> {
  const users = await readUsers();
  return users.find((user) => user.id === id) ?? null;
}

/**
 * The account for a directory resident, created on first sign-in. A legacy
 * name-only account with the same name is claimed by the resident, since the
 * phone number proved who they are.
 */
export async function userForPerson(person: { id: string; displayName: string }): Promise<CommunityUser> {
  return mutateUsers<CommunityUser>((users) => {
    const linked = users.find((user) => user.personId === person.id);
    if (linked) {
      return { users, result: linked };
    }
    const sameName = users.findIndex(
      (user) => !user.personId && user.name.localeCompare(person.displayName, undefined, { sensitivity: "base" }) === 0
    );
    if (sameName !== -1) {
      const next = [...users];
      next[sameName] = { ...next[sameName], personId: person.id, name: person.displayName };
      return { users: next, result: next[sameName] };
    }
    const user: CommunityUser = {
      id: randomUUID(),
      personId: person.id,
      name: person.displayName,
      email: null,
      verified: false,
      verifiedAt: null,
      createdAt: new Date().toISOString(),
      pendingVerification: null,
    };
    return { users: [...users, user], result: user };
  });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function startVerification(userId: string, email: string): Promise<{ token: string } | null> {
  const token = randomBytes(32).toString("hex");
  const updated = await mutateUsers((users) => {
    const index = users.findIndex((user) => user.id === userId);
    if (index === -1) return { users, result: false };
    const next = [...users];
    next[index] = {
      ...next[index],
      pendingVerification: {
        tokenHash: hashToken(token),
        email,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      },
    };
    return { users: next, result: true };
  });
  return updated ? { token } : null;
}

export async function verifyToken(token: string): Promise<CommunityUser | null> {
  const tokenHash = hashToken(token);
  return mutateUsers<CommunityUser | null>((users) => {
    const index = users.findIndex((user) => user.pendingVerification?.tokenHash === tokenHash);
    if (index === -1) return { users, result: null };
    const pending = users[index].pendingVerification!;
    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      const next = [...users];
      next[index] = { ...next[index], pendingVerification: null };
      return { users: next, result: null };
    }
    const next = [...users];
    next[index] = {
      ...next[index],
      email: pending.email,
      verified: true,
      verifiedAt: new Date().toISOString(),
      pendingVerification: null,
    };
    return { users: next, result: next[index] };
  });
}
