import { mutateJson, readJson } from "@/lib/storage";

/**
 * When each resident last used the app, for the admins' sign-in log: noted
 * from each open tab's check-in (`POST /api/presence`, every minute) and on
 * signing in — written at most every ten minutes per person, so it's "last
 * seen" to within that. One small document, `auth/last-seen.json`, keyed by
 * directory person id; forgotten when someone leaves the directory. Best
 * effort: it never throws.
 */

const KEY = "auth/last-seen.json";
/** Seen again this soon: not written again. */
export const SEEN_MS = 10 * 60 * 1000;

type LastSeen = { people: Record<string, string> };

function normalize(raw: unknown): LastSeen {
  const people = (raw as LastSeen | null)?.people;
  return { people: people && typeof people === "object" ? people : {} };
}

/** When each resident was last seen (ISO), by person id. */
export async function listLastSeen(): Promise<Record<string, string>> {
  return normalize(await readJson(KEY)).people;
}

// What this server last noted, so a check-in each minute isn't a read each minute.
const noted = new Map<string, number>();

/** Note that this resident is using the app now. */
export async function noteSeen(personId: string, now = Date.now()) {
  if (now - (noted.get(personId) ?? 0) < SEEN_MS) return;
  noted.set(personId, now);
  try {
    await mutateJson(KEY, (raw) => {
      const seen = normalize(raw);
      const last = Date.parse(seen.people[personId] ?? "");
      if (now - last < SEEN_MS) return { write: false, result: null };
      return {
        value: { people: { ...seen.people, [personId]: new Date(now).toISOString() } },
        result: null,
      };
    });
  } catch {
    noted.delete(personId);
  }
}

/** Forget these residents (they've left the directory). */
export async function forgetLastSeen(personIds: string[]) {
  try {
    await mutateJson(KEY, (raw) => {
      const seen = normalize(raw);
      const people = { ...seen.people };
      let changed = false;
      for (const id of personIds) if (id in people) changed = delete people[id];
      return changed ? { value: { people }, result: null } : { write: false, result: null };
    });
  } catch {
    // Next time.
  }
}
