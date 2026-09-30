import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * Comments on wiki pages: on the whole page, or on a passage (its `quote`,
 * highlighted on the page). A comment and its replies make a thread, which
 * can be resolved (and reopened). Stored per circle
 * (`wiki-comments/<circleId>.json`).
 */

export interface WikiComment {
  id: string;
  pageId: string;
  /** null: starts a thread; otherwise the thread it replies in. */
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  /** The passage it's about (thread starts only). */
  quote: string | null;
  createdAt: string;
  editedAt?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

const MAX_COMMENTS = 3000;

export const commentInputSchema = z.object({
  body: z.string().trim().min(1, "Write a comment").max(2000, "Comments must be 2000 characters or fewer"),
  quote: z.string().trim().max(300).optional().transform((value) => value || null),
  parentId: z.string().uuid().nullable().optional().transform((value) => value ?? null),
});
export const commentUpdateSchema = z.union([
  z.object({ body: z.string().trim().min(1, "Write a comment").max(2000, "Comments must be 2000 characters or fewer") }),
  z.object({ resolved: z.boolean() }),
]);

const key = (circleId: string) => `wiki-comments/${circleId}.json`;

function normalize(raw: unknown): WikiComment[] {
  const comments = (raw as { comments?: unknown } | null)?.comments;
  return Array.isArray(comments) ? (comments as WikiComment[]) : [];
}

/** A page's comments, oldest first. */
export async function listComments(circleId: string, pageId: string): Promise<WikiComment[]> {
  return normalize(await readJson(key(circleId))).filter((comment) => comment.pageId === pageId);
}

type Failure = "not_found" | "forbidden" | "full" | "unknown_thread";
export type CommentResult = { ok: true; comment: WikiComment | null; thread: WikiComment[] } | { ok: false; reason: Failure };

async function mutate(circleId: string, change: (comments: WikiComment[]) => { comments: WikiComment[]; comment: WikiComment | null; rootId: string | null } | Failure): Promise<CommentResult> {
  return enqueue<CommentResult>(key(circleId), async () => {
    const result = change(normalize(await readJson(key(circleId))));
    if (typeof result === "string") return { ok: false, reason: result };
    await writeJson(key(circleId), { comments: result.comments });
    const thread = result.rootId ? result.comments.filter((entry) => entry.id === result.rootId || entry.parentId === result.rootId) : [];
    return { ok: true, comment: result.comment, thread };
  });
}

export function addComment(circleId: string, pageId: string, author: { id: string; name: string }, input: { body: string; quote: string | null; parentId: string | null }) {
  return mutate(circleId, (comments) => {
    if (comments.length >= MAX_COMMENTS) return "full";
    if (input.parentId) {
      const root = comments.find((entry) => entry.id === input.parentId && entry.pageId === pageId && entry.parentId === null);
      if (!root) return "unknown_thread";
    }
    const comment: WikiComment = {
      id: randomUUID(),
      pageId,
      parentId: input.parentId,
      authorId: author.id,
      authorName: author.name,
      body: input.body,
      quote: input.parentId ? null : input.quote,
      createdAt: new Date().toISOString(),
    };
    return { comments: [...comments, comment], comment, rootId: input.parentId ?? comment.id };
  });
}

/** Change what you wrote. */
export function editComment(circleId: string, pageId: string, commentId: string, actor: { id: string }, body: string) {
  return mutate(circleId, (comments) => {
    const comment = comments.find((entry) => entry.id === commentId && entry.pageId === pageId);
    if (!comment) return "not_found";
    if (comment.authorId !== actor.id) return "forbidden";
    const updated = { ...comment, body, editedAt: new Date().toISOString() };
    return { comments: comments.map((entry) => (entry.id === commentId ? updated : entry)), comment: updated, rootId: comment.parentId ?? comment.id };
  });
}

/** Resolve or reopen a thread: whoever started it, the page's editors, or an admin. */
export function setResolved(circleId: string, pageId: string, commentId: string, actor: { id: string; name: string; canModerate: boolean }, resolved: boolean) {
  return mutate(circleId, (comments) => {
    const root = comments.find((entry) => entry.id === commentId && entry.pageId === pageId && entry.parentId === null);
    if (!root) return "not_found";
    if (!actor.canModerate && root.authorId !== actor.id) return "forbidden";
    const updated = { ...root, resolvedAt: resolved ? new Date().toISOString() : null, resolvedBy: resolved ? actor.name : null };
    return { comments: comments.map((entry) => (entry.id === commentId ? updated : entry)), comment: updated, rootId: root.id };
  });
}

/** Delete a comment (its author or an admin); deleting a thread's first comment deletes its replies too. */
export function deleteComment(circleId: string, pageId: string, commentId: string, actor: { id: string; admin: boolean }) {
  return mutate(circleId, (comments) => {
    const comment = comments.find((entry) => entry.id === commentId && entry.pageId === pageId);
    if (!comment) return "not_found";
    if (!actor.admin && comment.authorId !== actor.id) return "forbidden";
    const remaining = comments.filter((entry) => entry.id !== commentId && entry.parentId !== commentId);
    return { comments: remaining, comment: null, rootId: comment.parentId };
  });
}

/** Remove a page's comments (when the page is deleted). */
export function deletePageComments(circleId: string, pageId: string) {
  return mutate(circleId, (comments) => ({ comments: comments.filter((entry) => entry.pageId !== pageId), comment: null, rootId: null }));
}

/** Remove a circle's wiki comments (when the circle is deleted). */
export function deleteCircleComments(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}
