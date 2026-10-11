import { mutateJson } from "@/lib/storage";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import type { Actor } from "@/lib/auth/actor";
import type { WikiPage } from "./store";
import { personIdsIn } from "./links";

/**
 * Residents mentioned in pages: written `:person[Ada Ash]{#<personId>}`
 * (typed as @ in the editor), read as an "@Ada Ash" chip linking to their
 * directory entry, and plain "@Ada Ash" in excerpts, headings and search.
 * Someone mentioned in a page is told once (push and email: the "mentions"
 * topic) — `wiki/mentions.json` remembers whom each page has told.
 */

const KEY = "wiki/mentions.json";
type Told = Record<string, string[]>;

/** Note that these people have been told about this page; the ones not told before. */
export function claimMentions(pageId: string, personIds: string[]) {
  return mutateJson<string[]>(KEY, (raw) => {
    const told = ((raw as { pages?: Told } | null)?.pages ?? {}) as Told;
    const before = told[pageId] ?? [];
    const fresh = personIds.filter((id) => !before.includes(id));
    if (!fresh.length) return { write: false, result: [] };
    return { value: { pages: { ...told, [pageId]: [...before, ...fresh] } }, result: fresh };
  });
}

/** Forget pages gone for good. */
export function forgetMentions(pageIds: string[]) {
  return mutateJson<void>(KEY, (raw) => {
    const told = ((raw as { pages?: Told } | null)?.pages ?? {}) as Told;
    if (!pageIds.some((id) => id in told)) return { write: false, result: undefined };
    const next = { ...told };
    for (const id of pageIds) delete next[id];
    return { value: { pages: next }, result: undefined };
  });
}

/** Tell the people newly mentioned in a page (never the one who mentioned them). Never throws. */
export async function tellMentioned(
  page: WikiPage,
  by: Pick<Actor, "userId" | "personId" | "name">
) {
  try {
    const mentioned = personIdsIn(page.body).filter((id) => id !== by.personId);
    if (!mentioned.length) return;
    const fresh = await claimMentions(page.id, mentioned);
    if (!fresh.length) return;
    const userIds = await userIdsForPeople(fresh);
    if (!userIds.length) return;
    await notify({
      topic: "mentions",
      title: `${by.name} mentioned you`,
      body: `In “${page.title}”`,
      url: `/wiki/${page.slug}`,
      tag: `mention-${page.id}`,
      onlyUserIds: userIds,
      exceptUserId: by.userId,
    });
  } catch (error) {
    console.warn(`[wiki] couldn't tell those mentioned (${(error as Error).name})`);
  }
}
