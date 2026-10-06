import { randomUUID } from "crypto";
import { mutateJson, readJson } from "@/lib/storage";

/**
 * Community user registry. Every account belongs to a resident in the
 * directory (linked by personId) and is created on that resident's first
 * sign-in with an emailed link or code.
 */

export interface CommunityUser {
  id: string;
  /** The directory resident this account belongs to; null for legacy name-only accounts. */
  personId?: string | null;
  name: string;
  createdAt: string;
  /** When they finished or skipped the welcome tour; unset until then (it shows once, on any device). */
  tourSeenAt?: string;
}

export interface PublicUser {
  id: string;
  name: string;
  personId: string | null;
  photoUrl?: string | null;
  isAdmin?: boolean;
  /** An admin or the Board Secretary: may add, edit, and remove people in the directory. */
  canManageDirectory?: boolean;
  /** An admin or on the Board: may list homes for sale. */
  canManageHomes?: boolean;
  /** Whether they've finished or skipped the welcome tour. */
  tourSeen?: boolean;
  /** An account made in the last couple of days: the tour greets them as new. */
  newAccount?: boolean;
}

/** How long an account counts as new, for the tour's greeting. */
const NEW_FOR_MS = 2 * 24 * 60 * 60 * 1000;

const USERS_KEY = "auth/users.json";

function normalizeUsers(raw: unknown): CommunityUser[] {
  const doc = (raw ?? {}) as { users?: unknown };
  if (!Array.isArray(doc.users)) return [];
  return doc.users.filter(
    (user): user is CommunityUser =>
      !!user &&
      typeof (user as CommunityUser).id === "string" &&
      typeof (user as CommunityUser).name === "string"
  );
}

async function readUsers(): Promise<CommunityUser[]> {
  return normalizeUsers(await readJson(USERS_KEY));
}

async function mutateUsers<T>(
  mutate: (users: CommunityUser[]) => { users: CommunityUser[]; result: T }
): Promise<T> {
  return mutateJson<T>(USERS_KEY, (raw) => {
    const { users, result } = mutate(normalizeUsers(raw));
    return { value: { users }, result };
  });
}

/** Every account, for mapping accounts to residents (e.g. who an email goes to). */
export async function listUsers(): Promise<CommunityUser[]> {
  return readUsers();
}

export function toPublicUser(user: CommunityUser, now = Date.now()): PublicUser {
  return {
    id: user.id,
    name: user.name,
    personId: user.personId ?? null,
    tourSeen: !!user.tourSeenAt,
    newAccount: now - new Date(user.createdAt).getTime() < NEW_FOR_MS,
  };
}

/** Remember that someone has finished (or skipped) the welcome tour. */
export async function markTourSeen(userId: string): Promise<void> {
  const user = await getUser(userId);
  if (!user || user.tourSeenAt) return;
  await mutateUsers((users) => ({
    users: users.map((entry) =>
      entry.id === userId && !entry.tourSeenAt
        ? { ...entry, tourSeenAt: new Date().toISOString() }
        : entry
    ),
    result: null,
  }));
}

export async function getUser(id: string): Promise<CommunityUser | null> {
  const users = await readUsers();
  return users.find((user) => user.id === id) ?? null;
}

/** A resident's account, if they've signed in before (never creates one). */
export async function getUserForPerson(personId: string): Promise<CommunityUser | null> {
  const users = await readUsers();
  return users.find((user) => user.personId === personId) ?? null;
}

/** The account ids of these residents (those who have signed in), e.g. to notify a circle's members. */
export async function userIdsForPeople(personIds: (string | null)[]): Promise<string[]> {
  const wanted = new Set(personIds.filter(Boolean));
  return (await readUsers())
    .filter((user) => user.personId && wanted.has(user.personId))
    .map((user) => user.id);
}

/**
 * The account for a directory resident, created on first sign-in. A legacy
 * name-only account with the same name is claimed by the resident, since the
 * emailed link or code proved who they are.
 */
export async function userForPerson(person: {
  id: string;
  displayName: string;
}): Promise<CommunityUser> {
  return mutateUsers<CommunityUser>((users) => {
    const linked = users.find((user) => user.personId === person.id);
    if (linked) {
      return { users, result: linked };
    }
    const sameName = users.findIndex(
      (user) =>
        !user.personId &&
        user.name.localeCompare(person.displayName, undefined, { sensitivity: "base" }) === 0
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
      createdAt: new Date().toISOString(),
    };
    return { users: [...users, user], result: user };
  });
}

/** Close a resident's account (when they leave the directory), ending their sessions. Returns the removed account ids. */
export async function removeUsersForPerson(personId: string): Promise<string[]> {
  return mutateUsers<string[]>((users) => ({
    users: users.filter((user) => user.personId !== personId),
    result: users.filter((user) => user.personId === personId).map((user) => user.id),
  }));
}

/** Keep the account name in step with the resident's edited display name. */
export async function renameUserForPerson(personId: string, name: string): Promise<void> {
  await mutateUsers((users) => ({
    users: users.map((user) => (user.personId === personId ? { ...user, name } : user)),
    result: null,
  }));
}
