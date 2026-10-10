import { getRealSessionUser, getViewAs } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/actor";
import { readDirectory } from "@/lib/directory/store";
import { isPersonId } from "@/lib/profiles/store";
import { problem } from "@/lib/http";
import type { Failure } from "./store";

/**
 * The messages routes: your own account only — never while an admin is
 * viewing the app as someone, since messages are private — with people as the
 * directory now has them (an entry merged into another answers as that one).
 * Who's in the directory is kept for a minute per server, so polling doesn't
 * read the whole directory each time.
 */

type People = { canonical: (id: string) => string; name: (id: string) => string | null };

const PEOPLE_MS = 60_000;
let people: { at: number; value: Promise<People> } | null = null;

async function loadPeople(): Promise<People> {
  const directory = await readDirectory();
  if (!directory) throw new Error("The directory hasn't been imported yet");
  const aliases = directory.aliases ?? {};
  const names = new Map(directory.people.map((person) => [person.id, person.displayName]));
  return { canonical: (id) => aliases[id] ?? id, name: (id) => names.get(id) ?? null };
}

/** The directory's people (refreshed if `fresh`, or once a minute). */
export async function directoryPeople(fresh = false): Promise<People> {
  if (fresh || !people || Date.now() - people.at > PEOPLE_MS)
    people = { at: Date.now(), value: loadPeople() };
  try {
    return await people.value;
  } catch (error) {
    people = null;
    throw error;
  }
}

export async function chatContext() {
  if (await getViewAs())
    return { error: problem("Messages are private: exit the view to see your own", 403) };
  const user = await getRealSessionUser();
  if (!user?.personId) return { error: problem("Sign in to continue", 401) };
  const directory = await directoryPeople().catch(() => null);
  if (!directory) return { error: problem("The directory hasn't been imported yet", 503) };
  const me = directory.canonical(user.personId);
  return { user, me, actor: { ...actorOf(user), personId: me }, directory };
}

/** The other person in a conversation, from the URL: someone in the directory, not you. */
export async function otherPerson(id: string, me: string, fresh = false) {
  if (!isPersonId(id)) return null;
  const directory = await directoryPeople(fresh);
  const other = directory.canonical(id);
  return other !== me && directory.name(other) ? other : null;
}

export function chatProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That message no longer exists", 404);
    case "forbidden":
      return problem("You can only delete your own messages", 403);
  }
}
