import { z } from "zod";
import { deleteJson, enqueue, mutateJson, readJson } from "@/lib/storage";
import {
  addComment,
  deleteComment,
  editComment,
  type CommentActor,
  type CommentChange,
  type CommentFailure,
} from "@/lib/comments/store";
import { normalizeComment } from "@/lib/comments/shared";
import type { TaskComment } from "./shared";

/**
 * Comments on tasks, which nest: a comment can reply to any other on the
 * same task. Stored per circle (`task-comments/<circleId>.json`), following
 * the shared comment rules (`lib/comments/store.ts`): authors edit and
 * delete their own, the circle's editors and admins can delete any.
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
  return Array.isArray(comments) ? (comments as TaskComment[]).map(normalizeComment) : [];
}

export async function listTaskComments(circleId: string, taskId?: string): Promise<TaskComment[]> {
  const comments = normalize(await readJson(key(circleId)));
  return taskId ? comments.filter((comment) => comment.taskId === taskId) : comments;
}

export type Failure = CommentFailure;
export type TaskCommentResult =
  | { ok: true; comment: TaskComment | null; comments: TaskComment[] }
  | { ok: false; reason: Failure };

async function mutate(
  circleId: string,
  change: (comments: TaskComment[]) => CommentChange<TaskComment> | Failure
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

const onTask = (taskId: string) => ({
  nesting: "any" as const,
  max: MAX_COMMENTS,
  among: (comment: TaskComment) => comment.taskId === taskId,
});

export function addTaskComment(
  circleId: string,
  taskId: string,
  author: Pick<CommentActor, "userId" | "personId" | "name">,
  input: { body: string; parentId: string | null }
) {
  return mutate(circleId, (comments) =>
    addComment(comments, author, input, onTask(taskId), { taskId })
  );
}

export function editTaskComment(
  circleId: string,
  taskId: string,
  commentId: string,
  actor: CommentActor,
  body: string
) {
  return mutate(circleId, (comments) =>
    editComment(comments, commentId, actor, body, onTask(taskId))
  );
}

export function deleteTaskComment(
  circleId: string,
  taskId: string,
  commentId: string,
  actor: CommentActor
) {
  return mutate(circleId, (comments) => deleteComment(comments, commentId, actor, onTask(taskId)));
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
