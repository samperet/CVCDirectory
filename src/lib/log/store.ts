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
import { normalizeComment, type CommentRecord } from "@/lib/comments/shared";

/**
 * A circle's Log: short updates, each with replies (one level) — a small
 * forum of its own, kept apart from the Forum because it never notifies or
 * emails anyone. Stored per circle (`logs/<circleId>.json`), following the
 * shared comment rules (`lib/comments/store.ts`): authors edit and delete
 * their own; the circle's members, the Board, and admins can delete any.
 */

export type LogEntry = CommentRecord & { circleId: string };

const MAX_ENTRIES = 5000;
const body = z
  .string()
  .trim()
  .min(1, "Write an update")
  .max(2000, "Updates must be 2000 characters or fewer");
export const logInputSchema = z.object({
  body,
  parentId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export const logUpdateSchema = z.object({ body });

const key = (circleId: string) => `logs/${circleId}.json`;

function normalize(raw: unknown): LogEntry[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries) ? (entries as LogEntry[]).map(normalizeComment) : [];
}

/** A circle's log, oldest first. */
export async function listLog(circleId: string): Promise<LogEntry[]> {
  return normalize(await readJson(key(circleId)));
}

export type Failure = CommentFailure;
export type LogResult = { ok: true; entry: LogEntry | null } | { ok: false; reason: Failure };

function mutate(
  circleId: string,
  change: (entries: LogEntry[]) => CommentChange<LogEntry> | Failure
): Promise<LogResult> {
  return mutateJson<LogResult>(key(circleId), (raw) => {
    const result = change(normalize(raw));
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    return { value: { entries: result.comments }, result: { ok: true, entry: result.comment } };
  });
}

const rules = { nesting: "one" as const, max: MAX_ENTRIES };

export function addLogEntry(
  circleId: string,
  author: Pick<CommentActor, "userId" | "personId" | "name">,
  input: { body: string; parentId: string | null }
) {
  return mutate(circleId, (entries) => addComment(entries, author, input, rules, { circleId }));
}

export function editLogEntry(circleId: string, id: string, actor: CommentActor, text: string) {
  return mutate(circleId, (entries) => editComment(entries, id, actor, text));
}

export function deleteLogEntry(circleId: string, id: string, actor: CommentActor) {
  return mutate(circleId, (entries) => deleteComment(entries, id, actor));
}

/** Remove a circle's log (when the circle is deleted). */
export function deleteCircleLog(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}
