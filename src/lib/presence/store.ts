import { mutateJson, readJson } from "@/lib/storage";

/**
 * Who's online: residents seen in the last few minutes. Each signed-in tab
 * checks in every minute while it's open (`POST /api/presence`), and closing
 * it takes you off at once. One document, `presence/online.json`, keyed by
 * directory person id; a check-in soon after the last isn't written again,
 * and those not seen lately are tidied away whenever it is. Best effort: if
 * it can't be written just now, who's online is still answered.
 */

const KEY = "presence/online.json";
/** Seen this recently: online. */
export const ONLINE_MS = 3 * 60 * 1000;
/** A check-in this soon after the last isn't written again. */
export const REWRITE_MS = 90 * 1000;

type Presence = { people: Record<string, { at: number }> };

function normalize(raw: unknown): Presence {
  const people = (raw as Presence | null)?.people;
  return { people: people && typeof people === "object" ? people : {} };
}

const onlineIn = (presence: Presence, now: number) =>
  Object.entries(presence.people)
    .filter(([, seen]) => now - seen.at < ONLINE_MS)
    .map(([personId]) => personId);

/** The person ids of those online now. */
export async function onlineNow(now = Date.now()): Promise<string[]> {
  return onlineIn(normalize(await readJson(KEY)), now);
}

/** Check in (or, not `here`, leave): who's online now. */
export async function checkIn(personId: string, here: boolean, now = Date.now()) {
  try {
    return await mutateJson<string[]>(KEY, (raw) => {
      const presence = normalize(raw);
      const seen = presence.people[personId];
      if (here ? !!seen && now - seen.at < REWRITE_MS : !seen)
        return { write: false, result: onlineIn(presence, now) };
      const people = Object.fromEntries(
        Object.entries(presence.people).filter(
          ([id, entry]) => id !== personId && now - entry.at < ONLINE_MS
        )
      );
      if (here) people[personId] = { at: now };
      const next = { people };
      return { value: next, result: onlineIn(next, now) };
    });
  } catch {
    return onlineNow(now).catch(() => []);
  }
}
