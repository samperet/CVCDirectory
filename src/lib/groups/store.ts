import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, mutateJson, readJson } from "@/lib/storage";
import {
  addComment,
  deleteComment,
  editComment,
  type CommentActor,
  type CommentFailure,
} from "@/lib/comments/store";
import { normalizeComment } from "@/lib/comments/shared";
import { excerptOf, type GroupPost, type GroupThread, type ThreadSummary } from "./shared";

/**
 * A circle's conversations, stored per circle: an index for its Forum
 * (`groups/<circleId>/index.json`) and one document per conversation
 * (`groups/<circleId>/threads/<id>.json`) holding its messages, which follow
 * the shared comment rules (authors edit and delete their own; the circle's
 * members, the Board, and admins any).
 */

export const MAX_TITLE = 160;
export const MAX_BODY = 50_000;
const MAX_POSTS = 2000;

export const threadInputSchema = z.object({
  title: z.string().trim().min(1, "Give the conversation a title").max(MAX_TITLE),
  body: z.string().trim().min(1, "Write a message").max(MAX_BODY, "That message is too long"),
});
export const postInputSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(MAX_BODY, "That message is too long"),
});

const indexKey = (circleId: string) => `groups/${circleId}/index.json`;
const threadKey = (circleId: string, threadId: string) =>
  `groups/${circleId}/threads/${threadId}.json`;

/** Who wrote a message: their account if they have one (else `person:<id>`), directory entry, and name. */
export type GroupAuthor = { userId: string; personId: string | null; name: string };

/** Index entries written while group email existed also carry `short`, `refs` and `titleKey`. */
type IndexEntry = ThreadSummary & Record<string, unknown>;
type ThreadDoc = { thread: GroupThread; posts: GroupPost[] };

const isUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function normalizeIndex(raw: unknown): IndexEntry[] {
  const threads = (raw as { threads?: unknown } | null)?.threads;
  return Array.isArray(threads) ? (threads as IndexEntry[]) : [];
}

function normalizeThread(raw: unknown): ThreadDoc | null {
  const value = raw as Partial<ThreadDoc> | null;
  if (!value?.thread || !Array.isArray(value.posts)) return null;
  return { thread: value.thread, posts: value.posts.map((post) => normalizeComment(post)) };
}

/** A circle's conversations, latest activity first. */
export async function listThreads(circleId: string): Promise<ThreadSummary[]> {
  return normalizeIndex(await readJson(indexKey(circleId)))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .map(({ short: _s, refs: _r, titleKey: _t, ...summary }) => summary as ThreadSummary);
}

export async function getThread(circleId: string, threadId: string): Promise<ThreadDoc | null> {
  if (!isUuid(threadId)) return null;
  return normalizeThread(await readJson(threadKey(circleId, threadId)));
}

function summaryOf(doc: ThreadDoc): ThreadSummary {
  const live = doc.posts.filter((post) => !post.deletedAt);
  const first = doc.posts[0];
  const last = live[live.length - 1] ?? first;
  return {
    id: doc.thread.id,
    title: doc.thread.title,
    authorName: first?.authorName ?? "",
    createdAt: doc.thread.createdAt,
    lastAt: doc.thread.lastAt,
    lastBy: last?.authorName ?? "",
    count: live.length,
    via: first?.via ?? "web",
    hasPoll: !!doc.thread.hasPoll,
    excerpt: excerptOf(first?.deletedAt ? "" : first?.body ?? ""),
  };
}

function upsertIndex(circleId: string, doc: ThreadDoc) {
  return mutateJson(indexKey(circleId), (raw) => {
    const index = normalizeIndex(raw);
    const entry = summaryOf(doc);
    return {
      value: { threads: [entry, ...index.filter((other) => other.id !== entry.id)] },
      result: undefined,
    };
  });
}

export type Failure = CommentFailure | "not_found";
export type PostResult =
  | { ok: true; thread: GroupThread; post: GroupPost }
  | { ok: false; reason: Failure };

/** Start a conversation. */
export async function startThread(
  circleId: string,
  author: GroupAuthor,
  input: { title: string; body: string }
): Promise<PostResult> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const result = await mutateJson<PostResult>(threadKey(circleId, id), () => {
    const added = addComment<GroupPost>(
      [],
      author,
      { body: input.body, parentId: null },
      { nesting: "none", max: MAX_POSTS },
      { via: "web" }
    );
    if (typeof added === "string") return { write: false, result: { ok: false, reason: added } };
    const post = { ...added.comment!, id };
    const thread: GroupThread = {
      id,
      circleId,
      title: input.title.slice(0, MAX_TITLE),
      createdAt: now,
      lastAt: now,
    };
    return { value: { thread, posts: [post] }, result: { ok: true, thread, post } };
  });
  if (result.ok) await upsertIndex(circleId, { thread: result.thread, posts: [result.post] });
  return result;
}

/** Add a message to a conversation. */
export async function addPost(
  circleId: string,
  threadId: string,
  author: GroupAuthor,
  input: { body: string }
): Promise<PostResult> {
  if (!isUuid(threadId)) return { ok: false, reason: "not_found" };
  let doc: ThreadDoc | null = null;
  const result = await mutateJson<PostResult>(threadKey(circleId, threadId), (raw) => {
    const current = normalizeThread(raw);
    if (!current) return { write: false, result: { ok: false, reason: "not_found" } };
    const added = addComment<GroupPost>(
      current.posts,
      author,
      { body: input.body, parentId: null },
      { nesting: "none", max: MAX_POSTS },
      { via: "web" }
    );
    if (typeof added === "string") return { write: false, result: { ok: false, reason: added } };
    const post = added.comment!;
    const thread = { ...current.thread, lastAt: post.createdAt };
    doc = { thread, posts: [...current.posts, post] };
    return { value: doc, result: { ok: true, thread, post } };
  });
  if (result.ok && doc) await upsertIndex(circleId, doc);
  return result;
}

export async function setThreadHasPoll(circleId: string, threadId: string) {
  let doc: ThreadDoc | null = null;
  await mutateJson(threadKey(circleId, threadId), (raw) => {
    const current = normalizeThread(raw);
    if (!current || current.thread.hasPoll) return { write: false, result: undefined };
    doc = { ...current, thread: { ...current.thread, hasPoll: true } };
    return { value: doc, result: undefined };
  });
  if (doc) await upsertIndex(circleId, doc);
}

export async function editPost(
  circleId: string,
  threadId: string,
  postId: string,
  actor: CommentActor,
  body: string
): Promise<{ ok: true } | { ok: false; reason: Failure }> {
  return changePost(circleId, threadId, (posts) => editComment(posts, postId, actor, body));
}

/** Delete a message; deleting the opening message of a conversation with no replies deletes the conversation. */
export async function deletePost(
  circleId: string,
  threadId: string,
  postId: string,
  actor: CommentActor
): Promise<{ ok: true } | { ok: false; reason: Failure }> {
  return changePost(circleId, threadId, (posts) => deleteComment(posts, postId, actor));
}

async function changePost(
  circleId: string,
  threadId: string,
  change: (posts: GroupPost[]) => { comments: GroupPost[] } | CommentFailure
): Promise<{ ok: true } | { ok: false; reason: Failure }> {
  if (!isUuid(threadId)) return { ok: false, reason: "not_found" };
  let doc: ThreadDoc | null = null;
  const result = await mutateJson<{ ok: true } | { ok: false; reason: Failure }>(
    threadKey(circleId, threadId),
    (raw) => {
      const current = normalizeThread(raw);
      if (!current) return { write: false, result: { ok: false, reason: "not_found" } };
      const changed = change(current.posts);
      if (typeof changed === "string")
        return { write: false, result: { ok: false, reason: changed } };
      doc = { ...current, posts: changed.comments };
      return { value: doc, result: { ok: true } };
    }
  );
  if (result.ok && doc) {
    const updated: ThreadDoc = doc;
    if (!updated.posts.some((post) => !post.deletedAt)) await removeThread(circleId, threadId);
    else await upsertIndex(circleId, updated);
  }
  return result;
}

/** Remove a conversation entirely (its last message was deleted, or a moderator removed it). */
export async function removeThread(circleId: string, threadId: string) {
  await mutateJson(indexKey(circleId), (raw) => {
    const index = normalizeIndex(raw);
    if (!index.some((entry) => entry.id === threadId)) return { write: false, result: undefined };
    return {
      value: { threads: index.filter((entry) => entry.id !== threadId) },
      result: undefined,
    };
  });
  await enqueue(threadKey(circleId, threadId), () => deleteJson(threadKey(circleId, threadId)));
}

/** Forget a deleted circle's conversations index (the conversations' own documents stay). */
export async function deleteCircleGroups(circleId: string) {
  await enqueue(indexKey(circleId), () => deleteJson(indexKey(circleId)));
}
