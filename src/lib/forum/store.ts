import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, readJson, writeJson } from "@/lib/storage";
import type { Poll } from "@/lib/polls/shared";
import { PollInput, castVote, newPoll, pollInputSchema, pollUpdateSchema, voteSchema, withClosed } from "@/lib/polls/server";
import { GENERAL_TOPIC_ID } from "./topics";

/**
 * Forum threads, one document per thread (the opening post plus every reply,
 * stored flat with parentId links) and an index document for the thread list.
 * Replies nest to any depth; the tree is assembled by the client.
 *
 * Authors can edit and delete their own posts, and admins can moderate any
 * post. Deleting a reply that others have answered leaves a placeholder so the
 * conversation below it survives; placeholders disappear once nothing hangs
 * off them.
 */

/** Who is acting: their account id, and whether they're an admin. */
export interface ForumActor {
  id: string;
  admin: boolean;
}

const mayChange = (authorId: string, actor: ForumActor) => actor.admin || authorId === actor.id;

/** Someone who liked a post; the name is kept so "liked by…" needs no lookups. */
export interface ForumLike {
  userId: string;
  name: string;
}

export interface ForumReply {
  id: string;
  parentId: string | null; // null = a direct reply to the opening post
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  likes?: ForumLike[];
}

/** A poll on a discussion; the discussion's title is its question. */
export type ForumPoll = Poll;

export interface ForumThread {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  editedAt?: string | null;
  likes?: ForumLike[];
  poll?: ForumPoll;
  /** Its forum topic; unset means General. */
  topicId?: string;
}


export interface ForumThreadDocument {
  thread: ForumThread;
  replies: ForumReply[];
}

export interface ForumThreadSummary {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  lastActivityAt: string;
  replyCount: number;
  /** The discussion has a poll. */
  poll?: boolean;
  /** Its forum topic; unset means General. */
  topicId?: string;
}

/**
 * A discussion's topic, counting discussions from before topics as General —
 * and, given the topics that exist, those whose topic is gone.
 */
export const topicOf = (thread: { topicId?: string }, known?: Set<string>) => {
  const id = thread.topicId || GENERAL_TOPIC_ID;
  return known && !known.has(id) ? GENERAL_TOPIC_ID : id;
};

const title = z.string().trim().min(3, "Title must be at least 3 characters").max(160, "Title must be 160 characters or fewer");
// A discussion needs a post, unless it's a poll (whose title is the question).
const postBody = z.string().trim().max(5000, "Post must be 5000 characters or fewer");
const replyBody = z.string().trim().min(1, "Reply cannot be empty").max(3000, "Reply must be 3000 characters or fewer");

const topicId = z.string().regex(/^[a-z0-9-]{1,40}$/, "Choose a topic");

export const threadInputSchema = z
  .object({ title, body: postBody.default(""), poll: pollInputSchema.optional(), topicId: topicId.default(GENERAL_TOPIC_ID) })
  .refine((value) => value.body.length > 0 || value.poll, { message: "Write something to start the discussion", path: ["body"] });

export const threadUpdateSchema = z
  .object({ title: title.optional(), body: postBody.optional(), topicId: topicId.optional() })
  .refine((value) => value.title !== undefined || value.body !== undefined || value.topicId !== undefined, "Nothing to update");

export { pollUpdateSchema, voteSchema };

export const replyInputSchema = z.object({
  parentId: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  body: replyBody,
});

export const replyUpdateSchema = z.object({ body: replyBody });

const INDEX_KEY = "forum/index.json";
const MAX_REPLIES = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thread ids come from URLs and become storage keys, so only UUIDs are accepted. */
export function isThreadId(id: string) {
  return UUID.test(id);
}

function threadKey(id: string) {
  if (!isThreadId(id)) throw new Error("Invalid thread id");
  return `forum/threads/${id}.json`;
}

function normalizeIndex(raw: unknown): ForumThreadSummary[] {
  const threads = (raw as { threads?: unknown } | null)?.threads;
  return Array.isArray(threads) ? (threads as ForumThreadSummary[]) : [];
}

const live = (replies: ForumReply[]) => replies.filter((reply) => !reply.deletedAt);

/** Most recently active first. */
export async function listThreads(): Promise<ForumThreadSummary[]> {
  const threads = normalizeIndex(await readJson(INDEX_KEY));
  return [...threads].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export async function getThread(id: string): Promise<ForumThreadDocument | null> {
  if (!isThreadId(id)) return null;
  const doc = (await readJson(threadKey(id))) as ForumThreadDocument | null;
  return doc?.thread ? { thread: doc.thread, replies: Array.isArray(doc.replies) ? doc.replies : [] } : null;
}

async function updateIndex(update: (threads: ForumThreadSummary[]) => ForumThreadSummary[]) {
  await enqueue(INDEX_KEY, async () => {
    const threads = normalizeIndex(await readJson(INDEX_KEY));
    await writeJson(INDEX_KEY, { threads: update(threads) });
  });
}

/** Refresh a thread's list entry (title, reply count, last activity) from its document. */
async function syncSummary(doc: ForumThreadDocument) {
  const replies = live(doc.replies);
  const lastActivityAt = replies.length ? replies[replies.length - 1].createdAt : doc.thread.createdAt;
  await updateIndex((threads) =>
    threads.map((summary) =>
      summary.id === doc.thread.id
        ? { ...summary, title: doc.thread.title, replyCount: replies.length, lastActivityAt, topicId: topicOf(doc.thread) }
        : summary
    )
  );
}

export async function createThread(
  author: { id: string; name: string },
  input: { title: string; body: string; topicId: string; poll?: PollInput }
): Promise<ForumThreadDocument> {
  const now = new Date().toISOString();
  const thread: ForumThread = {
    id: randomUUID(),
    title: input.title,
    body: input.body,
    authorId: author.id,
    authorName: author.name,
    createdAt: now,
    topicId: input.topicId,
    ...(input.poll ? { poll: newPoll(input.poll) } : {}),
  };
  const doc: ForumThreadDocument = { thread, replies: [] };
  await enqueue(threadKey(thread.id), () => writeJson(threadKey(thread.id), doc));
  await updateIndex((threads) => [
    ...threads,
    {
      id: thread.id,
      title: thread.title,
      authorId: author.id,
      authorName: author.name,
      createdAt: now,
      lastActivityAt: now,
      replyCount: 0,
      topicId: input.topicId,
      ...(thread.poll ? { poll: true } : {}),
    },
  ]);
  return doc;
}

type Failure = "not_found" | "forbidden" | "unknown_parent" | "full" | "has_replies" | "empty_post" | "poll_closed" | "invalid_vote";
export type ThreadResult = { ok: true; doc: ForumThreadDocument } | { ok: false; reason: Failure };

/**
 * Apply a change to one thread under its write queue, then refresh the
 * thread's list entry. The change returns the updated document or a failure.
 */
async function mutateThread(
  threadId: string,
  change: (doc: ForumThreadDocument) => ForumThreadDocument | Failure,
  { sync = true }: { sync?: boolean } = {}
): Promise<ThreadResult> {
  if (!isThreadId(threadId)) return { ok: false, reason: "not_found" };
  const result = await enqueue<ThreadResult>(threadKey(threadId), async () => {
    const doc = await getThread(threadId);
    if (!doc) return { ok: false, reason: "not_found" };
    const next = change(doc);
    if (typeof next === "string") return { ok: false, reason: next };
    await writeJson(threadKey(threadId), next);
    return { ok: true, doc: next };
  });
  if (result.ok && sync) await syncSummary(result.doc);
  return result;
}

export function addReply(threadId: string, author: { id: string; name: string }, input: { parentId: string | null; body: string }) {
  return mutateThread(threadId, (doc) => {
    if (input.parentId && !live(doc.replies).some((reply) => reply.id === input.parentId)) return "unknown_parent";
    if (doc.replies.length >= MAX_REPLIES) return "full";
    const reply: ForumReply = {
      id: randomUUID(),
      parentId: input.parentId,
      authorId: author.id,
      authorName: author.name,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    return { ...doc, replies: [...doc.replies, reply] };
  });
}

export function editReply(threadId: string, actor: ForumActor, replyId: string, body: string) {
  return mutateThread(threadId, (doc) => {
    const reply = doc.replies.find((entry) => entry.id === replyId && !entry.deletedAt);
    if (!reply) return "not_found";
    if (!mayChange(reply.authorId, actor)) return "forbidden";
    return {
      ...doc,
      replies: doc.replies.map((entry) =>
        entry.id === replyId ? { ...entry, body, editedAt: new Date().toISOString() } : entry
      ),
    };
  });
}

/**
 * Remove your own reply (or, for admins, anyone's). If others answered it,
 * keep a placeholder so their replies stay attached; then drop any
 * placeholders left with no replies.
 */
export function deleteReply(threadId: string, actor: ForumActor, replyId: string) {
  return mutateThread(threadId, (doc) => {
    const reply = doc.replies.find((entry) => entry.id === replyId && !entry.deletedAt);
    if (!reply) return "not_found";
    if (!mayChange(reply.authorId, actor)) return "forbidden";

    let replies = doc.replies.map((entry) =>
      entry.id === replyId ? { ...entry, body: "", likes: [], deletedAt: new Date().toISOString() } : entry
    );
    // Prune placeholders with nothing beneath them, walking up the chain.
    for (;;) {
      const parents = new Set(replies.map((entry) => entry.parentId));
      const pruned = replies.filter((entry) => !entry.deletedAt || parents.has(entry.id));
      if (pruned.length === replies.length) break;
      replies = pruned;
    }
    return { ...doc, replies };
  });
}

export function editThread(threadId: string, actor: ForumActor, update: { title?: string; body?: string; topicId?: string }) {
  return mutateThread(threadId, (doc) => {
    if (!mayChange(doc.thread.authorId, actor)) return "forbidden";
    if (update.body !== undefined && !update.body && !doc.thread.poll) return "empty_post";
    // Moving a discussion to another topic isn't an edit of what was said.
    const edited = update.title !== undefined || update.body !== undefined;
    return { ...doc, thread: { ...doc.thread, ...update, ...(edited ? { editedAt: new Date().toISOString() } : {}) } };
  });
}

/**
 * Delete your own discussion — only while nobody else has replied, so their
 * comments are never lost. Admins can delete any discussion, replies and all.
 */
export async function deleteThread(threadId: string, actor: ForumActor): Promise<{ ok: true } | { ok: false; reason: Failure }> {
  if (!isThreadId(threadId)) return { ok: false, reason: "not_found" };
  const result = await enqueue<{ ok: true } | { ok: false; reason: Failure }>(threadKey(threadId), async () => {
    const doc = await getThread(threadId);
    if (!doc) return { ok: false, reason: "not_found" };
    if (!mayChange(doc.thread.authorId, actor)) return { ok: false, reason: "forbidden" };
    if (!actor.admin && live(doc.replies).some((reply) => reply.authorId !== actor.id)) {
      return { ok: false, reason: "has_replies" };
    }
    await deleteJson(threadKey(threadId));
    return { ok: true };
  });
  if (result.ok) await updateIndex((threads) => threads.filter((summary) => summary.id !== threadId));
  return result;
}

function withLike(likes: ForumLike[] | undefined, user: { id: string; name: string }, liked: boolean): ForumLike[] {
  const others = (likes ?? []).filter((like) => like.userId !== user.id);
  return liked ? [...others, { userId: user.id, name: user.name }] : others;
}

/**
 * Like or unlike a post: the opening post when `replyId` is null, otherwise a
 * reply. Setting the same state twice is harmless. Likes don't change the
 * thread's place in the list, so the index is left alone.
 */
export function setLike(threadId: string, replyId: string | null, user: { id: string; name: string }, liked: boolean) {
  return mutateThread(
    threadId,
    (doc) => {
      if (replyId === null) return { ...doc, thread: { ...doc.thread, likes: withLike(doc.thread.likes, user, liked) } };
      const reply = doc.replies.find((entry) => entry.id === replyId && !entry.deletedAt);
      if (!reply) return "not_found";
      return {
        ...doc,
        replies: doc.replies.map((entry) => (entry.id === replyId ? { ...entry, likes: withLike(entry.likes, user, liked) } : entry)),
      };
    },
    { sync: false }
  );
}

/**
 * Vote in a discussion's poll, replacing any earlier vote; no options takes
 * the vote back. One option unless the poll allows several.
 */
export function vote(threadId: string, user: { id: string; name: string }, optionIds: string[]) {
  return mutateThread(
    threadId,
    (doc) => {
      if (!doc.thread.poll) return "not_found";
      const poll = castVote(doc.thread.poll, user, optionIds);
      return typeof poll === "string" ? poll : { ...doc, thread: { ...doc.thread, poll } };
    },
    { sync: false }
  );
}

/** Close a poll, or reopen it (clearing a closing time that has passed): its author or an admin. */
export function setPollClosed(threadId: string, actor: ForumActor, closed: boolean) {
  return mutateThread(
    threadId,
    (doc) => {
      if (!doc.thread.poll) return "not_found";
      if (!mayChange(doc.thread.authorId, actor)) return "forbidden";
      return { ...doc, thread: { ...doc.thread, poll: withClosed(doc.thread.poll, closed) } };
    },
    { sync: false }
  );
}

/** Move every discussion in one topic to another (when a topic is removed). */
export async function moveTopicThreads(fromTopicId: string, toTopicId: string) {
  const threads = (await listThreads()).filter((summary) => topicOf(summary) === fromTopicId);
  for (const summary of threads) {
    await mutateThread(summary.id, (doc) => ({ ...doc, thread: { ...doc.thread, topicId: toTopicId } }));
  }
  return threads.length;
}
