import { mutateJson, readJson } from "@/lib/storage";

/**
 * Who's editing which wiki page right now. Editors check in every few
 * seconds while the editor is open (and say when they leave); anyone not
 * heard from in 30 seconds has gone. One small document per circle
 * (`wiki-presence/<circleId>.json`).
 */

export interface PageEditor {
  userId: string;
  name: string;
}

type Seen = { name: string; at: number };
type Presence = { pages: Record<string, Record<string, Seen>> };

const ACTIVE_MS = 30_000;
/** A check-in this soon after the last is not written again. */
const REFRESH_MS = 8_000;

const key = (circleId: string) => `wiki-presence/${circleId}.json`;

function normalize(raw: unknown): Presence {
  const pages = (raw as Presence | null)?.pages;
  return { pages: pages && typeof pages === "object" ? pages : {} };
}

const active = (seen: Record<string, Seen> | undefined, now: number): PageEditor[] =>
  Object.entries(seen ?? {})
    .filter(([, entry]) => now - entry.at < ACTIVE_MS)
    .map(([userId, entry]) => ({ userId, name: entry.name }));

/** Who's editing a page. */
export async function editorsOf(circleId: string, slug: string): Promise<PageEditor[]> {
  return active(normalize(await readJson(key(circleId))).pages[slug], Date.now());
}

/** Check in as editing a page (or say you've stopped); returns who's editing it now. */
export function checkIn(circleId: string, slug: string, editor: PageEditor, editing: boolean): Promise<PageEditor[]> {
  return mutateJson(key(circleId), (raw) => {
    const now = Date.now();
    const presence = normalize(raw);
    const seen = presence.pages[slug]?.[editor.userId];
    const fresh = !!seen && now - seen.at < REFRESH_MS;
    if (editing ? fresh : !seen) return { write: false, result: active(presence.pages[slug], now) };
    // Tidy away everyone who's gone, on every page.
    const pages: Presence["pages"] = {};
    for (const [page, entries] of Object.entries(presence.pages)) {
      const kept = Object.fromEntries(Object.entries(entries).filter(([, entry]) => now - entry.at < ACTIVE_MS));
      if (Object.keys(kept).length) pages[page] = kept;
    }
    const mine = { ...(pages[slug] ?? {}) };
    if (editing) mine[editor.userId] = { name: editor.name, at: now };
    else delete mine[editor.userId];
    if (Object.keys(mine).length) pages[slug] = mine;
    else delete pages[slug];
    return { value: { pages }, result: active(pages[slug], now) };
  });
}
