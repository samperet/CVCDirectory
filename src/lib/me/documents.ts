import { deleteJson, mutateJson, readJson } from "@/lib/storage";
import { normalizeLists, withStar, withView, type DocRef, type MyDocumentLists } from "./shared";

/**
 * Each account's starred and recently opened documents
 * (`me/documents/<userId>.json`; the rules are in `shared.ts`). Deleted with
 * the account, when someone leaves the directory.
 */

const keyOf = (userId: string) => `me/documents/${userId}.json`;

export type StarFailure = "full";

export const readMyDocuments = async (userId: string): Promise<MyDocumentLists> =>
  normalizeLists(await readJson(keyOf(userId)));

/** Star or unstar a document. */
export function setStarred(userId: string, ref: DocRef, on: boolean, now = new Date()) {
  return mutateJson<{ ok: true } | { ok: false; reason: StarFailure }>(keyOf(userId), (raw) => {
    const lists = normalizeLists(raw);
    const starred = withStar(lists.starred, ref, on, now.toISOString());
    if (!starred) return { write: false, result: { ok: false, reason: "full" } };
    if (starred === lists.starred) return { write: false, result: { ok: true } };
    return { value: { ...lists, starred }, result: { ok: true } };
  });
}

/** Note that a document was just opened. */
export function recordView(userId: string, ref: DocRef, now = new Date()) {
  return mutateJson<void>(keyOf(userId), (raw) => {
    const lists = normalizeLists(raw);
    const [latest] = lists.recent;
    // Opened again straight away (a reload, say): nothing to change.
    if (
      latest?.kind === ref.kind &&
      latest.id === ref.id &&
      now.getTime() - Date.parse(latest.at) < 60_000
    )
      return { write: false, result: undefined };
    return {
      value: { ...lists, recent: withView(lists.recent, ref, now.toISOString()) },
      result: undefined,
    };
  });
}

/** Forget the lists of accounts that are closing. */
export async function deleteMyDocuments(userIds: string[]) {
  await Promise.all(userIds.map((id) => deleteJson(keyOf(id)).catch(() => undefined)));
}
