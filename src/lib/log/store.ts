import { z } from "zod";
import { deleteJson, enqueue, mutateJson, readJson } from "@/lib/storage";
import {
  addComment,
  canChangeComment,
  deleteComment,
  editComment,
  type CommentActor,
  type CommentChange,
  type CommentFailure,
} from "@/lib/comments/store";
import { normalizeComment, type CommentRecord } from "@/lib/comments/shared";
import { namedPeopleSchema, type NamedPerson } from "@/lib/people";

/**
 * A circle's Log: short updates, each with replies (one level) — a small
 * forum of its own, kept apart from the Forum because it never notifies or
 * emails anyone. Stored per circle (`logs/<circleId>.json`), following the
 * shared comment rules (`lib/comments/store.ts`): authors edit and delete
 * their own; the circle's members, the Board, and admins can delete any.
 * An update can record the people it involved (residents, or anyone by
 * name), which its author can change later; replies don't.
 */

export type LogEntry = CommentRecord & {
  circleId: string;
  /** Who an update involved (never on a reply). */
  people?: NamedPerson[];
};

const MAX_ENTRIES = 5000;
const people = namedPeopleSchema(50);
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
  people: people.optional(),
});
export const logUpdateSchema = z
  .object({ body: body.optional(), people: people.optional() })
  .refine((value) => value.body !== undefined || value.people !== undefined, "Nothing to update");

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

/** Post an update, with who it involved, or a reply (which records nobody). */
export function addLogEntry(
  circleId: string,
  author: Pick<CommentActor, "userId" | "personId" | "name">,
  { people = [], ...input }: { body: string; parentId: string | null; people?: NamedPerson[] }
) {
  const extras = { circleId, ...(people.length && !input.parentId ? { people } : {}) };
  return mutate(circleId, (entries) => addComment(entries, author, input, rules, extras));
}

/**
 * Change what an update or reply says, and who an update involved (people
 * sent for a reply are ignored). Both are the author's to change.
 */
export function editLogEntry(
  circleId: string,
  id: string,
  actor: CommentActor,
  change: { body?: string; people?: NamedPerson[] }
) {
  return mutate(circleId, (entries) => {
    const entry = entries.find((candidate) => candidate.id === id && !candidate.deletedAt);
    if (!entry) return "not_found";
    if (!canChangeComment(entry, actor)) return "forbidden";
    const edited =
      change.body === undefined
        ? { comments: entries, comment: entry }
        : editComment(entries, id, actor, change.body);
    if (typeof edited === "string" || !change.people || entry.parentId) return edited;
    const { people: _old, ...rest } = edited.comment!;
    const updated: LogEntry = change.people.length ? { ...rest, people: change.people } : rest;
    return {
      comments: edited.comments.map((candidate) => (candidate.id === id ? updated : candidate)),
      comment: updated,
    };
  });
}

export function deleteLogEntry(circleId: string, id: string, actor: CommentActor) {
  return mutate(circleId, (entries) => deleteComment(entries, id, actor));
}

/** Remove a circle's log (when the circle is deleted). */
export function deleteCircleLog(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}
