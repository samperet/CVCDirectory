import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * Forum threads, one document per thread (the opening post plus every reply,
 * stored flat with parentId links) and an index document for the thread list.
 * Replies nest to any depth; the tree is assembled by the client.
 */

export interface ForumReply {
  id: string;
  parentId: string | null; // null = a direct reply to the opening post
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ForumThread {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
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
}

export const threadInputSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160, "Title must be 160 characters or fewer"),
  body: z.string().trim().min(1, "Write something to start the discussion").max(5000, "Post must be 5000 characters or fewer"),
});

export const replyInputSchema = z.object({
  parentId: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  body: z.string().trim().min(1, "Reply cannot be empty").max(3000, "Reply must be 3000 characters or fewer"),
});

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

export async function createThread(
  author: { id: string; name: string },
  input: { title: string; body: string }
): Promise<ForumThreadDocument> {
  const now = new Date().toISOString();
  const thread: ForumThread = {
    id: randomUUID(),
    title: input.title,
    body: input.body,
    authorId: author.id,
    authorName: author.name,
    createdAt: now,
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
    },
  ]);
  return doc;
}

export type AddReplyResult =
  | { ok: true; doc: ForumThreadDocument }
  | { ok: false; reason: "not_found" | "unknown_parent" | "full" };

export async function addReply(
  threadId: string,
  author: { id: string; name: string },
  input: { parentId: string | null; body: string }
): Promise<AddReplyResult> {
  if (!isThreadId(threadId)) return { ok: false, reason: "not_found" };

  const result = await enqueue<AddReplyResult>(threadKey(threadId), async () => {
    const doc = await getThread(threadId);
    if (!doc) return { ok: false, reason: "not_found" };
    if (input.parentId && !doc.replies.some((reply) => reply.id === input.parentId)) {
      return { ok: false, reason: "unknown_parent" };
    }
    if (doc.replies.length >= MAX_REPLIES) return { ok: false, reason: "full" };

    const reply: ForumReply = {
      id: randomUUID(),
      parentId: input.parentId,
      authorId: author.id,
      authorName: author.name,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    const updated = { ...doc, replies: [...doc.replies, reply] };
    await writeJson(threadKey(threadId), updated);
    return { ok: true, doc: updated };
  });

  if (result.ok) {
    const { doc } = result;
    const lastActivityAt = doc.replies[doc.replies.length - 1].createdAt;
    await updateIndex((threads) =>
      threads.map((summary) =>
        summary.id === threadId ? { ...summary, lastActivityAt, replyCount: doc.replies.length } : summary
      )
    );
  }
  return result;
}
