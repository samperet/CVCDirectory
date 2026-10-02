import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, mutateJson, readJson } from "@/lib/storage";
import type { TaskComment } from "./shared";
import type { Actor } from "@/lib/auth/actor";

/**
 * Comments on tasks, which nest: a comment can reply to any other on the
 * same task. Stored per circle (`task-comments/<circleId>.json`).
 */

const MAX_COMMENTS = 5000;
const body = z
  .string()
  .trim()
  .min(1, "Write a comment")
  .max(4000, "Comments must be 4000 characters or fewer");
export const taskCommentInputSchema = z.object({
  body,
  parentId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export const taskCommentUpdateSchema = z.object({ body });

const key = (circleId: string) => `task-comments/${circleId}.json`;

function normalize(raw: unknown): TaskComment[] {
  const comments = (raw as { comments?: unknown } | null)?.comments;
  return Array.isArray(comments) ? (comments as TaskComment[]) : [];
}

export async function listTaskComments(circleId: string, taskId?: string): Promise<TaskComment[]> {
  const comments = normalize(await readJson(key(circleId)));
  return taskId ? comments.filter((comment) => comment.taskId === taskId) : comments;
}

/** The comments a comment replies to, nearest first. */
export function ancestors(comments: TaskComment[], comment: TaskComment) {
  const chain: TaskComment[] = [];
  let parent = comments.find((entry) => entry.id === comment.parentId);
  while (parent && chain.length < 100) {
    chain.push(parent);
    const next = parent.parentId;
    parent = comments.find((entry) => entry.id === next);
  }
  return chain;
}

export type Failure = "not_found" | "forbidden" | "full" | "unknown_parent";
export type TaskCommentResult =
  | { ok: true; comment: TaskComment | null; comments: TaskComment[] }
  | { ok: false; reason: Failure };

async function mutate(
  circleId: string,
  change: (
    comments: TaskComment[]
  ) => { comments: TaskComment[]; comment: TaskComment | null } | Failure
): Promise<TaskCommentResult> {
  return mutateJson<TaskCommentResult>(key(circleId), (raw) => {
    const result = change(normalize(raw));
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    return {
      value: { comments: result.comments },
      result: { ok: true, comment: result.comment, comments: result.comments },
    };
  });
}

export function addTaskComment(
  circleId: string,
  taskId: string,
  author: Pick<Actor, "userId" | "name">,
  input: { body: string; parentId: string | null }
) {
  return mutate(circleId, (comments) => {
    if (comments.length >= MAX_COMMENTS) return "full";
    if (
      input.parentId &&
      !comments.some((entry) => entry.id === input.parentId && entry.taskId === taskId)
    )
      return "unknown_parent";
    const comment: TaskComment = {
      id: randomUUID(),
      taskId,
      parentId: input.parentId,
      authorId: author.userId,
      authorName: author.name,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    return { comments: [...comments, comment], comment };
  });
}

/** Change what you wrote. */
export function editTaskComment(
  circleId: string,
  taskId: string,
  commentId: string,
  actor: Pick<Actor, "userId">,
  body: string
) {
  return mutate(circleId, (comments) => {
    const comment = comments.find(
      (entry) => entry.id === commentId && entry.taskId === taskId && !entry.deleted
    );
    if (!comment) return "not_found";
    if (comment.authorId !== actor.userId) return "forbidden";
    const updated = { ...comment, body, editedAt: new Date().toISOString() };
    return {
      comments: comments.map((entry) => (entry.id === commentId ? updated : entry)),
      comment: updated,
    };
  });
}

/**
 * Delete a comment (its author, or a moderator). One with replies stays, as
 * "deleted", so the conversation under it still makes sense; one without goes
 * — and so does a deleted parent left with no replies.
 */
export function deleteTaskComment(
  circleId: string,
  taskId: string,
  commentId: string,
  actor: Pick<Actor, "userId"> & { canModerate: boolean }
) {
  return mutate(circleId, (comments) => {
    const comment = comments.find(
      (entry) => entry.id === commentId && entry.taskId === taskId && !entry.deleted
    );
    if (!comment) return "not_found";
    if (!actor.canModerate && comment.authorId !== actor.userId) return "forbidden";
    let next = comments.some((entry) => entry.parentId === commentId)
      ? comments.map((entry) =>
          entry.id === commentId ? { ...entry, body: "", deleted: true } : entry
        )
      : comments.filter((entry) => entry.id !== commentId);
    // Tidy up deleted comments that no longer have anything under them.
    for (let parentId = comment.parentId; parentId; ) {
      const parent = next.find((entry) => entry.id === parentId);
      if (!parent?.deleted || next.some((entry) => entry.parentId === parent.id)) break;
      next = next.filter((entry) => entry.id !== parent.id);
      parentId = parent.parentId;
    }
    return { comments: next, comment: null };
  });
}

/** Remove a task's comments (when the task is deleted). */
export function deleteCommentsForTask(circleId: string, taskId: string) {
  return mutate(circleId, (comments) => ({
    comments: comments.filter((entry) => entry.taskId !== taskId),
    comment: null,
  }));
}

/** Remove a circle's task comments (when the circle is deleted). */
export function deleteCircleTaskComments(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}
