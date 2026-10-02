import { randomUUID } from "crypto";
import type { Actor } from "@/lib/auth/actor";
import type { CommentRecord, Nesting } from "./shared";

/**
 * The rules every feature's comments follow, as operations on a list of
 * comments (the feature's store reads its document, applies one, and writes
 * the result back). Nothing here touches storage.
 *
 * - Adding: a reply must answer a comment that's there (and not deleted);
 *   with one-level nesting, a top-level one. Lists have a size limit.
 * - Editing and deleting: the author, or a moderator (the feature says who:
 *   admins, or admins and the circle's editors).
 * - Deleting a comment with replies keeps a placeholder, so the replies keep
 *   their place; deleting the last reply under a placeholder removes the
 *   placeholder too, all the way up.
 */

export type CommentFailure = "not_found" | "forbidden" | "full" | "unknown_parent";

/** Who's acting, and whether they can change anyone's comment. */
export type CommentActor = Pick<Actor, "userId" | "personId" | "name"> & { canModerate: boolean };

export interface CommentRules<T extends CommentRecord> {
  nesting: Nesting;
  /** The most comments the list holds. */
  max: number;
  /** When one list holds several things' comments: which belong to this one (a parent must). */
  among?: (comment: T) => boolean;
}

export type CommentChange<T> = { comments: T[]; comment: T | null };

export const canChangeComment = (comment: CommentRecord, actor: CommentActor) =>
  actor.canModerate || comment.authorId === actor.userId;

const findLive = <T extends CommentRecord>(
  comments: T[],
  id: string,
  among?: (comment: T) => boolean
) =>
  comments.find(
    (comment) => comment.id === id && !comment.deletedAt && (among ? among(comment) : true)
  );

/**
 * Add a comment. `extras` are the feature's own fields (a task id, a quote, a
 * kind); the result's `comment` is the one added.
 */
export function addComment<T extends CommentRecord>(
  comments: T[],
  author: Pick<CommentActor, "userId" | "personId" | "name">,
  input: { body: string; parentId: string | null },
  rules: CommentRules<T>,
  extras: Omit<T, keyof CommentRecord>,
  now = new Date()
): CommentChange<T> | CommentFailure {
  const mine = rules.among ? comments.filter(rules.among) : comments;
  if (mine.length >= rules.max) return "full";
  let parentId: string | null = null;
  if (input.parentId) {
    if (rules.nesting === "none") return "unknown_parent";
    const parent = findLive(comments, input.parentId, rules.among);
    if (!parent) return "unknown_parent";
    if (rules.nesting === "one" && parent.parentId !== null) return "unknown_parent";
    parentId = parent.id;
  }
  const comment = {
    id: randomUUID(),
    parentId,
    authorId: author.userId,
    authorPersonId: author.personId,
    authorName: author.name,
    body: input.body,
    createdAt: now.toISOString(),
    ...extras,
  } as T;
  return { comments: [...comments, comment], comment };
}

/** Change what a comment says: its author, or a moderator. */
export function editComment<T extends CommentRecord>(
  comments: T[],
  id: string,
  actor: CommentActor,
  body: string,
  rules?: Pick<CommentRules<T>, "among">,
  now = new Date()
): CommentChange<T> | CommentFailure {
  const comment = findLive(comments, id, rules?.among);
  if (!comment) return "not_found";
  if (!canChangeComment(comment, actor)) return "forbidden";
  const updated = { ...comment, body, editedAt: now.toISOString() };
  return {
    comments: comments.map((entry) => (entry.id === id ? updated : entry)),
    comment: updated,
  };
}

/**
 * Delete a comment: its author, or a moderator. One with replies stays as a
 * placeholder (empty, `deletedAt` set); one without is removed — and so is
 * any placeholder above it left with nothing underneath.
 */
export function deleteComment<T extends CommentRecord>(
  comments: T[],
  id: string,
  actor: CommentActor,
  rules?: Pick<CommentRules<T>, "among">,
  now = new Date()
): CommentChange<T> | CommentFailure {
  const comment = findLive(comments, id, rules?.among);
  if (!comment) return "not_found";
  if (!canChangeComment(comment, actor)) return "forbidden";
  const hasReplies = (parentId: string, list: T[]) =>
    list.some((entry) => entry.parentId === parentId);
  let next = hasReplies(id, comments)
    ? comments.map((entry) =>
        entry.id === id ? { ...entry, body: "", deletedAt: now.toISOString() } : entry
      )
    : comments.filter((entry) => entry.id !== id);
  for (let parentId = comment.parentId; parentId; ) {
    const parent = next.find((entry) => entry.id === parentId);
    if (!parent?.deletedAt || hasReplies(parent.id, next)) break;
    next = next.filter((entry) => entry.id !== parent.id);
    parentId = parent.parentId;
  }
  return { comments: next, comment: null };
}
