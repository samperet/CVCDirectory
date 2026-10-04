import { createHash, randomUUID } from "crypto";
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
import {
  cleanSubject,
  excerptOf,
  normalizeLocal,
  type GroupPost,
  type GroupThread,
  type HeldMessage,
  type ThreadSummary,
  type Via,
} from "./shared";

/**
 * A circle's conversations, stored per circle: an index for its Forum
 * (`groups/<circleId>/index.json`) and one document per conversation
 * (`groups/<circleId>/threads/<id>.json`) holding its messages, which follow
 * the shared comment rules (authors edit and delete their own; the circle's
 * members, the Board, and admins any). A message that arrives by email gets
 * an id made from the email's, so the same email delivered twice is kept
 * once. Also here: messages held for a moderator, and the old addresses a
 * renamed circle keeps answering to.
 */

export const MAX_TITLE = 160;
export const MAX_BODY = 50_000;
const MAX_POSTS = 2000;
const MAX_HELD = 200;
const HELD_DAYS = 14;
const MAX_REFS = 50;

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
const heldKey = (circleId: string) => `groups/${circleId}/held.json`;
const ALIASES = "groups/aliases.json";

/** Who wrote a message: their account if they have one (else `person:<id>`), directory entry, and name. */
export type GroupAuthor = { userId: string; personId: string | null; name: string };

type IndexEntry = ThreadSummary & { short: string; refs: string[]; titleKey: string };
type ThreadDoc = { thread: GroupThread; posts: GroupPost[] };

const isUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** An id made from an email's id (and the circle), so a re-delivered email maps to the same message. */
export function idFromEmail(emailId: string, circleId: string): string {
  const hex = createHash("sha256").update(`${emailId}:${circleId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(
    17,
    20
  )}-${hex.slice(20, 32)}`;
}

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
    .map(({ short: _s, refs: _r, titleKey: _t, ...summary }) => summary);
}

export async function getThread(circleId: string, threadId: string): Promise<ThreadDoc | null> {
  if (!isUuid(threadId)) return null;
  return normalizeThread(await readJson(threadKey(circleId, threadId)));
}

/**
 * The conversation an emailed reply belongs to: by its reply tag's short id,
 * then by the message ids it answers, then by the same subject within 30
 * days. Null: it starts a new one.
 */
export async function findThread(
  circleId: string,
  clues: { short?: string | null; refs?: string[]; subject?: string }
): Promise<string | null> {
  const index = normalizeIndex(await readJson(indexKey(circleId)));
  if (clues.short) {
    const found = index.find((entry) => entry.short === clues.short);
    if (found) return found.id;
  }
  const refs = new Set((clues.refs ?? []).map((ref) => ref.toLowerCase()));
  for (const ref of Array.from(refs)) {
    const ours = /^<?t\.([0-9a-f-]{36})@/i.exec(ref);
    if (ours && index.some((entry) => entry.id === ours[1].toLowerCase()))
      return ours[1].toLowerCase();
  }
  if (refs.size) {
    const found = index.find((entry) => entry.refs.some((ref) => refs.has(ref)));
    if (found) return found.id;
  }
  const subject = clues.subject ? cleanSubject(clues.subject).toLowerCase() : "";
  if (subject) {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const found = index
      .filter((entry) => entry.titleKey === subject && entry.lastAt >= since)
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0];
    if (found) return found.id;
  }
  return null;
}

function summaryOf(doc: ThreadDoc, refs: string[]): IndexEntry {
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
    short: doc.thread.id.replace(/-/g, "").slice(0, 12),
    refs: refs.slice(-MAX_REFS),
    titleKey: doc.thread.title.toLowerCase(),
  };
}

function upsertIndex(circleId: string, doc: ThreadDoc, newRefs: string[] = []) {
  return mutateJson(indexKey(circleId), (raw) => {
    const index = normalizeIndex(raw);
    const before = index.find((entry) => entry.id === doc.thread.id);
    const refs = Array.from(
      new Set([...(before?.refs ?? []), ...newRefs.map((ref) => ref.toLowerCase())])
    );
    const entry = summaryOf(doc, refs);
    return {
      value: { threads: [entry, ...index.filter((other) => other.id !== entry.id)] },
      result: undefined,
    };
  });
}

export type Failure = CommentFailure | "not_found";
export type PostResult =
  | { ok: true; thread: GroupThread; post: GroupPost; duplicate: boolean }
  | { ok: false; reason: Failure };

/** Start a conversation. With `id` (from an email), starting it twice keeps the first. */
export async function startThread(
  circleId: string,
  author: GroupAuthor,
  input: {
    title: string;
    body: string;
    via: Via;
    id?: string;
    emailRef?: string;
    skippedAttachments?: number;
  }
): Promise<PostResult> {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  const result = await mutateJson<PostResult>(threadKey(circleId, id), (raw) => {
    const existing = normalizeThread(raw);
    if (existing)
      return {
        write: false,
        result: { ok: true, thread: existing.thread, post: existing.posts[0], duplicate: true },
      };
    const added = addComment<GroupPost>(
      [],
      author,
      { body: input.body, parentId: null },
      { nesting: "none", max: MAX_POSTS },
      {
        via: input.via,
        ...(input.skippedAttachments ? { skippedAttachments: input.skippedAttachments } : {}),
      }
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
    return {
      value: { thread, posts: [post] },
      result: { ok: true, thread, post, duplicate: false },
    };
  });
  if (result.ok && !result.duplicate)
    await upsertIndex(
      circleId,
      { thread: result.thread, posts: [result.post] },
      input.emailRef ? [input.emailRef] : []
    );
  return result;
}

/** Add a message to a conversation. With `id` (from an email), adding it twice keeps the first. */
export async function addPost(
  circleId: string,
  threadId: string,
  author: GroupAuthor,
  input: { body: string; via: Via; id?: string; emailRef?: string; skippedAttachments?: number }
): Promise<PostResult> {
  if (!isUuid(threadId)) return { ok: false, reason: "not_found" };
  let doc: ThreadDoc | null = null;
  const result = await mutateJson<PostResult>(threadKey(circleId, threadId), (raw) => {
    const current = normalizeThread(raw);
    if (!current) return { write: false, result: { ok: false, reason: "not_found" } };
    const existing = input.id ? current.posts.find((post) => post.id === input.id) : undefined;
    if (existing)
      return {
        write: false,
        result: { ok: true, thread: current.thread, post: existing, duplicate: true },
      };
    const added = addComment<GroupPost>(
      current.posts,
      author,
      { body: input.body, parentId: null },
      { nesting: "none", max: MAX_POSTS },
      {
        via: input.via,
        ...(input.skippedAttachments ? { skippedAttachments: input.skippedAttachments } : {}),
      }
    );
    if (typeof added === "string") return { write: false, result: { ok: false, reason: added } };
    const post = { ...added.comment!, ...(input.id ? { id: input.id } : {}) };
    const thread = { ...current.thread, lastAt: post.createdAt };
    doc = { thread, posts: [...current.posts, post] };
    return { value: doc, result: { ok: true, thread, post, duplicate: false } };
  });
  if (result.ok && !result.duplicate && doc)
    await upsertIndex(circleId, doc, input.emailRef ? [input.emailRef] : []);
  return result;
}

/** Remember the message ids of copies we sent, or of emails that became messages (for threading replies). */
export async function rememberRefs(circleId: string, threadId: string, refs: string[]) {
  const doc = await getThread(circleId, threadId);
  if (doc && refs.length) await upsertIndex(circleId, doc, refs);
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

// ——— Held messages ———

function normalizeHeld(raw: unknown): HeldMessage[] {
  const held = (raw as { held?: unknown } | null)?.held;
  const since = new Date(Date.now() - HELD_DAYS * 864e5).toISOString();
  return Array.isArray(held) ? (held as HeldMessage[]).filter((entry) => entry.at >= since) : [];
}

export async function listHeld(circleId: string): Promise<HeldMessage[]> {
  return normalizeHeld(await readJson(heldKey(circleId)));
}

/** Hold a message for a moderator (kept 14 days; the same email held twice is kept once). */
export function holdMessage(message: Omit<HeldMessage, "at">) {
  return mutateJson(heldKey(message.circleId), (raw) => {
    const held = normalizeHeld(raw);
    if (held.some((entry) => entry.id === message.id)) return { write: false, result: false };
    const next = [...held, { ...message, at: new Date().toISOString() }].slice(-MAX_HELD);
    return { value: { held: next }, result: true };
  });
}

/** Take a held message out of the queue (approved or rejected); returns it. */
export function takeHeld(circleId: string, id: string) {
  return mutateJson<HeldMessage | null>(heldKey(circleId), (raw) => {
    const held = normalizeHeld(raw);
    const found = held.find((entry) => entry.id === id) ?? null;
    if (!found) return { write: false, result: null };
    return { value: { held: held.filter((entry) => entry.id !== id) }, result: found };
  });
}

// ——— Addresses a circle keeps after a rename ———

export async function readAliases(): Promise<Record<string, string>> {
  const aliases = (await readJson(ALIASES)) as { aliases?: Record<string, string> } | null;
  return aliases?.aliases ?? {};
}

/** Keep answering to an old address part (a circle renamed); never taken over by another circle. */
export function addAlias(local: string, circleId: string) {
  const key = normalizeLocal(local);
  if (!key) return Promise.resolve();
  return mutateJson(ALIASES, (raw) => {
    const aliases = (raw as { aliases?: Record<string, string> } | null)?.aliases ?? {};
    if (aliases[key]) return { write: false, result: undefined };
    return { value: { aliases: { ...aliases, [key]: circleId } }, result: undefined };
  });
}

/** Forget a deleted circle's conversations index and held messages (the conversations' own documents stay). */
export async function deleteCircleGroups(circleId: string) {
  await enqueue(indexKey(circleId), () => deleteJson(indexKey(circleId)));
  await enqueue(heldKey(circleId), () => deleteJson(heldKey(circleId)));
}
