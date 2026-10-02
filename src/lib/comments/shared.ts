/**
 * What every comment in the app has in common — on tasks, wiki pages, forum
 * discussions (their replies), recommendations, and proposals. Each feature
 * keeps its comments with the rest of its data and adds its own fields (a
 * wiki comment's quote, a proposal comment's kind, a forum reply's likes),
 * but the record, the rules for adding, editing and deleting (`store.ts`),
 * and the way they're shown (`components/comments`) are shared. Safe for
 * the browser.
 */

export interface CommentRecord {
  id: string;
  /** null for a comment on the thing itself; otherwise the comment it replies to. */
  parentId: string | null;
  authorId: string;
  /** The author's directory entry (null for an account without one, and for older comments). */
  authorPersonId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  /** Deleted, but kept (shown as "deleted") because replies hang off it; its body is empty. */
  deletedAt?: string | null;
}

/** How replies nest: not at all, one level under a top-level comment (a thread), or any depth. */
export type Nesting = "none" | "one" | "any";

export const isDeleted = (comment: Pick<CommentRecord, "deletedAt">) => !!comment.deletedAt;

/** The comments that haven't been deleted. */
export const liveComments = <T extends CommentRecord>(comments: T[]) =>
  comments.filter((comment) => !comment.deletedAt);

/** Comments grouped by what they reply to (null: the top level), each group oldest first. */
export function childrenOf<T extends CommentRecord>(comments: T[]): Map<string | null, T[]> {
  const map = new Map<string | null, T[]>();
  for (const comment of comments) {
    const list = map.get(comment.parentId) ?? [];
    list.push(comment);
    map.set(comment.parentId, list);
  }
  map.forEach((list) => list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  return map;
}

/** The top-level comments, each with the replies under it (one level, as threads). */
export function threadsOf<T extends CommentRecord>(comments: T[]): { root: T; replies: T[] }[] {
  return comments
    .filter((comment) => comment.parentId === null)
    .map((root) => ({ root, replies: comments.filter((comment) => comment.parentId === root.id) }));
}

/** The comments a comment replies to, nearest first. */
export function ancestors<T extends CommentRecord>(comments: T[], comment: T): T[] {
  const chain: T[] = [];
  let parent = comments.find((entry) => entry.id === comment.parentId);
  while (parent && chain.length < 100) {
    chain.push(parent);
    const next = parent.parentId;
    parent = comments.find((entry) => entry.id === next);
  }
  return chain;
}

/**
 * A stored comment with what older records lack filled in: `parentId` and
 * `authorPersonId` (null), and tasks' old `deleted` flag as `deletedAt`
 * (the time isn't known, so its creation time stands in).
 */
export function normalizeComment<T extends { createdAt: string }>(raw: T): T & CommentRecord {
  const { deleted, ...rest } = raw as T & { deleted?: boolean } & Partial<CommentRecord>;
  return {
    ...rest,
    parentId: rest.parentId ?? null,
    authorPersonId: rest.authorPersonId ?? null,
    ...(rest.deletedAt || deleted ? { deletedAt: rest.deletedAt || raw.createdAt } : {}),
  } as T & CommentRecord;
}
