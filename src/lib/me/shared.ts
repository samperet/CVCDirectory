/**
 * Each resident's own short lists of documents (safe for the browser):
 * those they've **starred**, to find again from the Documents menu, and
 * those they've opened **recently**. A document is a written page, a file,
 * or a proposal, by its id; the server resolves titles and addresses when
 * the lists are read, leaving out anything since deleted (or in the trash).
 */

export const DOC_KINDS = ["page", "file", "proposal"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** A document, by what it is and its id. */
export interface DocRef {
  kind: DocKind;
  id: string;
}

/** A reference with when it was starred, or last opened. */
export interface DatedRef extends DocRef {
  at: string;
}

export interface MyDocumentLists {
  starred: DatedRef[];
  recent: DatedRef[];
}

/** A document in one of the lists, as the menus show it. */
export interface MyDocument extends DocRef {
  title: string;
  href: string;
  circleName: string;
  /** Opens in a new tab (a file). */
  external: boolean;
}

export const MAX_STARRED = 50;
export const MAX_RECENT = 20;

export const sameDoc = (a: DocRef, b: DocRef) => a.kind === b.kind && a.id === b.id;

/** Star (newest first) or unstar a document; null when there's no room for another star. */
export function withStar(list: DatedRef[], ref: DocRef, on: boolean, at: string) {
  const without = list.filter((entry) => !sameDoc(entry, ref));
  if (!on) return without;
  if (without.length !== list.length) return list;
  if (list.length >= MAX_STARRED) return null;
  return [{ kind: ref.kind, id: ref.id, at }, ...list];
}

/** A document just opened goes to the top of the recent list (which keeps the latest few). */
export const withView = (list: DatedRef[], ref: DocRef, at: string) =>
  [{ kind: ref.kind, id: ref.id, at }, ...list.filter((entry) => !sameDoc(entry, ref))].slice(
    0,
    MAX_RECENT
  );

/** The lists as stored (anything unexpected dropped). */
export function normalizeLists(raw: unknown): MyDocumentLists {
  const value = (raw ?? {}) as Partial<Record<keyof MyDocumentLists, unknown>>;
  const refs = (list: unknown) =>
    Array.isArray(list)
      ? (list as DatedRef[]).filter(
          (entry) =>
            !!entry &&
            (DOC_KINDS as readonly string[]).includes(entry.kind) &&
            typeof entry.id === "string" &&
            typeof entry.at === "string"
        )
      : [];
  return { starred: refs(value.starred), recent: refs(value.recent) };
}
