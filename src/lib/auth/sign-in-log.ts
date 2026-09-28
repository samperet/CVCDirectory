import { enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * A log of successful sign-ins, newest kept, for admins. It records who
 * signed in and when — no phone numbers, addresses, or devices — and when an
 * admin viewed the app as someone.
 */

export interface SignInEntry {
  at: string;
  personId: string;
  name: string;
  /** Set when this was an admin viewing as the resident, not the resident signing in. */
  viewedBy?: string;
}

const KEY = "auth/sign-in-log.json";
const MAX_ENTRIES = 2000;

function normalize(raw: unknown): SignInEntry[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries) ? (entries as SignInEntry[]) : [];
}

/** Newest first. */
export async function listSignIns(): Promise<SignInEntry[]> {
  return [...normalize(await readJson(KEY))].reverse();
}

/** Record a sign-in. Never throws: a logging failure must not block signing in. */
export async function recordSignIn(person: { id: string; displayName: string }, viewedBy?: string): Promise<void> {
  try {
    await enqueue(KEY, async () => {
      const entries = normalize(await readJson(KEY));
      const entry: SignInEntry = {
        at: new Date().toISOString(),
        personId: person.id,
        name: person.displayName,
        ...(viewedBy ? { viewedBy } : {}),
      };
      await writeJson(KEY, { entries: [...entries, entry].slice(-MAX_ENTRIES) });
    });
  } catch (error) {
    console.error("[auth] could not record sign-in", error instanceof Error ? error.name : "error");
  }
}
