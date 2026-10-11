import { mutateJson, readJson } from "@/lib/storage";
import { notify } from "@/lib/push/notify";
import type { Actor } from "@/lib/auth/actor";
import type { WikiPage } from "./store";

/**
 * Following pages (`wiki/follows.json`): whoever follows a page — its
 * creator from the start, anyone who presses **Follow** — is told when it
 * changes: when someone finishes editing it, restores an earlier version,
 * or makes a version the page. At most once an hour a page (one notice,
 * replaced on the device: tag `wiki-edit-<pageId>`), never the one who
 * changed it; the "following" topic (push; email off unless chosen).
 */

const KEY = "wiki/follows.json";
const HOUR_MS = 60 * 60 * 1000;

interface Follows {
  /** Each page's followers (user ids). */
  pages: Record<string, string[]>;
  /** When each page's followers were last told. */
  told: Record<string, string>;
}

function normalize(raw: unknown): Follows {
  const value = (raw ?? {}) as Partial<Follows>;
  return { pages: value.pages ?? {}, told: value.told ?? {} };
}

export const readFollows = async () => normalize(await readJson(KEY));

export async function isFollowing(pageId: string, userId: string) {
  return (await readFollows()).pages[pageId]?.includes(userId) ?? false;
}

/** The ids of the pages someone follows. */
export async function pagesFollowedBy(userId: string) {
  const { pages } = await readFollows();
  return Object.keys(pages).filter((pageId) => pages[pageId].includes(userId));
}

/** Follow a page, or stop. */
export function setFollowing(pageId: string, userId: string, on: boolean) {
  return mutateJson<void>(KEY, (raw) => {
    const follows = normalize(raw);
    const current = follows.pages[pageId] ?? [];
    if (current.includes(userId) === on) return { write: false, result: undefined };
    const next = on ? [...current, userId] : current.filter((id) => id !== userId);
    const pages = { ...follows.pages, [pageId]: next };
    if (!next.length) delete pages[pageId];
    return { value: { ...follows, pages }, result: undefined };
  });
}

/** Whether it's been an hour since this page's followers were told (and if so, note now). */
export function claimTelling(pageId: string, now = new Date()) {
  return mutateJson<boolean>(KEY, (raw) => {
    const follows = normalize(raw);
    const last = follows.told[pageId];
    if (last && now.getTime() - Date.parse(last) < HOUR_MS) return { write: false, result: false };
    return {
      value: { ...follows, told: { ...follows.told, [pageId]: now.toISOString() } },
      result: true,
    };
  });
}

/** Tell a page's followers that it changed (`what`: how). Never throws. */
export async function tellFollowers(
  page: WikiPage,
  by: Pick<Actor, "userId" | "name">,
  what: string
) {
  try {
    const followers = ((await readFollows()).pages[page.id] ?? []).filter((id) => id !== by.userId);
    if (!followers.length || !(await claimTelling(page.id))) return;
    await notify({
      topic: "following",
      title: `“${page.title}” changed`,
      body: `${by.name} ${what}`,
      url: `/wiki/${page.slug}`,
      tag: `wiki-edit-${page.id}`,
      onlyUserIds: followers,
      exceptUserId: by.userId,
    });
  } catch (error) {
    console.warn(`[wiki] couldn't tell the page's followers (${(error as Error).name})`);
  }
}

/** Forget pages gone for good, or accounts that closed. */
export function forgetFollows({
  pageIds = [],
  userIds = [],
}: {
  pageIds?: string[];
  userIds?: string[];
}) {
  return mutateJson<void>(KEY, (raw) => {
    const follows = normalize(raw);
    let changed = false;
    const pages: Record<string, string[]> = {};
    for (const [pageId, ids] of Object.entries(follows.pages)) {
      if (pageIds.includes(pageId)) {
        changed = true;
        continue;
      }
      const kept = ids.filter((id) => !userIds.includes(id));
      if (kept.length !== ids.length) changed = true;
      if (kept.length) pages[pageId] = kept;
    }
    const told = { ...follows.told };
    for (const pageId of pageIds) if (pageId in told) (changed = true), delete told[pageId];
    return changed
      ? { value: { pages, told }, result: undefined }
      : { write: false, result: undefined };
  });
}
