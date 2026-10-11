import { deleteJson, mutateJson, readJson } from "@/lib/storage";
import { deletePageComments } from "./comments";
import { deletePerspectives } from "./perspectives";
import { forgetFollows } from "./follows";
import { forgetMentions } from "./mentions";
import { deletePage, reinsertPage, type WikiAuthor, type WikiPage } from "./store";

/**
 * The wiki's trash (`wiki/trash.json`): a deleted page is kept here for
 * `TRASH_DAYS`, with its history, comments and alternative versions left in
 * their own documents, so it can be restored as it was. Pages in the trash
 * are out of `wiki/pages.json`, so nothing else lists, links or searches
 * them. There's no scheduled job: whenever the trash is read or changed,
 * pages past their days are forgotten, and their history, comments and
 * versions deleted.
 */

export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = "wiki/trash.json";

export interface TrashedPage {
  page: WikiPage;
  deletedAt: string;
  deletedBy: WikiAuthor;
}

export type TrashFailure = "not_found" | "full";

function normalize(raw: unknown): TrashedPage[] {
  const pages = (raw as { pages?: unknown } | null)?.pages;
  return Array.isArray(pages) ? (pages as TrashedPage[]) : [];
}

/** Whether a page has been in the trash longer than it's kept. */
export const isExpired = (entry: Pick<TrashedPage, "deletedAt">, now: Date) =>
  now.getTime() - Date.parse(entry.deletedAt) > TRASH_DAYS * DAY_MS;

/** The day it'll be gone for good. */
export const keptUntil = (entry: Pick<TrashedPage, "deletedAt">) =>
  new Date(Date.parse(entry.deletedAt) + TRASH_DAYS * DAY_MS).toISOString();

/** Delete what a page left behind: its history, comments, alternative versions, followers and mentions told. */
async function deleteRemains(pageIds: string[]) {
  await Promise.all(
    pageIds.flatMap((id) => [
      deleteJson(`wiki/history/${id}.json`).catch(() => undefined),
      deletePageComments(id).catch(() => undefined),
      deletePerspectives(id).catch(() => undefined),
    ])
  );
  await forgetFollows({ pageIds }).catch(() => undefined);
  await forgetMentions(pageIds).catch(() => undefined);
}

/** Change the trash: what's past its days goes as well. The pages it then holds. */
async function change(
  apply: (pages: TrashedPage[]) => TrashedPage[],
  now: Date
): Promise<TrashedPage[]> {
  let expired: string[] = [];
  const kept = await mutateJson<TrashedPage[]>(KEY, (raw) => {
    const before = normalize(raw);
    const next = apply(before);
    expired = next.filter((entry) => isExpired(entry, now)).map((entry) => entry.page.id);
    const remaining = next.filter((entry) => !isExpired(entry, now));
    if (next === before && !expired.length) return { write: false, result: before };
    return { value: { pages: remaining }, result: remaining };
  });
  if (expired.length) await deleteRemains(expired);
  return kept;
}

/** The pages in the trash, the most recently deleted first (and the expired ones forgotten). */
export async function listTrash(now = new Date()) {
  const pages = normalize(await readJson(KEY));
  const current = pages.some((entry) => isExpired(entry, now))
    ? await change((list) => list, now)
    : pages;
  return [...current].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Move a page to the trash. It goes into the trash first, then out of the
 * pages, so a failure in between leaves it in both (restoring then just
 * clears the trash entry) — never in neither.
 */
export async function trashPage(page: WikiPage, by: WikiAuthor, now = new Date()) {
  await change(
    (list) => [
      ...list.filter((entry) => entry.page.id !== page.id),
      {
        page,
        deletedAt: now.toISOString(),
        deletedBy: { userId: by.userId, name: by.name },
      },
    ],
    now
  );
  return deletePage(page.slug);
}

/** Bring a page back from the trash (renamed or re-addressed if another took its title or address). */
export async function restoreFromTrash(
  pageId: string,
  options: { keeper?: string } = {},
  now = new Date()
): Promise<{ ok: true; page: WikiPage } | { ok: false; reason: TrashFailure }> {
  const entry = (await listTrash(now)).find((candidate) => candidate.page.id === pageId);
  if (!entry) return { ok: false, reason: "not_found" };
  const result = await reinsertPage(
    options.keeper ? { ...entry.page, keeper: options.keeper } : entry.page
  );
  if (!result.ok) return { ok: false, reason: result.reason === "full" ? "full" : "not_found" };
  await change((list) => list.filter((candidate) => candidate.page.id !== pageId), now);
  return { ok: true, page: result.page! };
}

/** Delete a page in the trash for good, with everything it left behind. */
export async function deleteForever(pageId: string, now = new Date()) {
  let found = false;
  await change((list) => {
    found = list.some((entry) => entry.page.id === pageId);
    return found ? list.filter((entry) => entry.page.id !== pageId) : list;
  }, now);
  if (!found) return { ok: false as const, reason: "not_found" as const };
  await deleteRemains([pageId]);
  return { ok: true as const };
}
