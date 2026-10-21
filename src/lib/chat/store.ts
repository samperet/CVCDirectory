import { deleteJson, listKeys, mutateJson, readJson } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";
import { addComment, deleteComment } from "@/lib/comments/store";
import { normalizeComment } from "@/lib/comments/shared";
import {
  MAX_MESSAGES,
  conversationId,
  type ChatIndex,
  type ChatMessage,
  type ConversationEntry,
} from "./shared";

/**
 * Private messages (`shared.ts`): each conversation in
 * `chat/conversations/<a>-<b>.json`, each person's index of theirs in
 * `chat/people/<personId>.json`. Sending adds the message, then brings both
 * people's indexes up to date (the sender has read it). Only its sender
 * deletes a message. A conversation keeps its latest `MAX_MESSAGES`. When
 * two directory entries turn out to be one person (combined), the
 * duplicate's conversations move to the kept entry (`mergeChat`), so
 * messages sent to either are read as one.
 */

export type Failure = "not_found" | "forbidden";

/** Who's sending: their account and their directory entry. */
type Person = Pick<Actor, "userId" | "name"> & { personId: string };

const conversationKey = (a: string, b: string) => `chat/conversations/${conversationId(a, b)}.json`;
const indexKey = (personId: string) => `chat/people/${personId}.json`;

function messagesOf(raw: unknown): ChatMessage[] {
  const list = (raw as { messages?: unknown } | null)?.messages;
  return Array.isArray(list) ? list.map((message) => normalizeComment(message as ChatMessage)) : [];
}

function indexOf(raw: unknown): ChatIndex {
  const conversations = (raw as { conversations?: ChatIndex } | null)?.conversations;
  return conversations && typeof conversations === "object" ? conversations : {};
}

export const readIndex = async (personId: string) => indexOf(await readJson(indexKey(personId)));

export const readMessages = async (a: string, b: string) =>
  messagesOf(await readJson(conversationKey(a, b)));

const excerptOf = (body: string) => {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
};

/** What an index says about a conversation's last message. */
function lastOf(messages: ChatMessage[]) {
  const last = [...messages].reverse().find((message) => !message.deletedAt);
  return {
    lastAt: last?.createdAt ?? null,
    lastExcerpt: last ? excerptOf(last.body) : "",
    lastFrom: last?.authorPersonId ?? null,
  };
}

/** Change `owner`'s entry for the conversation with `other` (null: leave it). */
function updateIndex(
  owner: string,
  other: string,
  change: (entry: ConversationEntry | undefined) => ConversationEntry | null
) {
  return mutateJson<ConversationEntry | null>(indexKey(owner), (raw) => {
    const index = indexOf(raw);
    const next = change(index[other]);
    if (!next) return { write: false, result: index[other] ?? null };
    return { value: { conversations: { ...index, [other]: next } }, result: next };
  });
}

/** Send `to` a message. */
export async function sendMessage(from: Person, to: string, body: string, now = new Date()) {
  const message = await mutateJson<ChatMessage>(conversationKey(from.personId, to), (raw) => {
    // The oldest go, to make room.
    const messages = messagesOf(raw).slice(-(MAX_MESSAGES - 1));
    const added = addComment(
      messages,
      from,
      { body, parentId: null },
      { nesting: "none", max: MAX_MESSAGES },
      {},
      now
    );
    if (typeof added === "string") throw new Error("This conversation can't take a message");
    return { value: { messages: added.comments }, result: added.comment! };
  });
  const at = now.toISOString();
  const last = {
    lastAt: message.createdAt,
    lastExcerpt: excerptOf(body),
    lastFrom: from.personId,
    changedAt: at,
  };
  await Promise.all([
    updateIndex(from.personId, to, () => ({ with: to, readAt: at, ...last })),
    updateIndex(to, from.personId, (entry) => ({
      with: from.personId,
      readAt: entry?.readAt ?? null,
      ...last,
    })),
  ]);
  return message;
}

/** You've read the conversation with `other` (written only if something was unread). */
export function markRead(me: string, other: string, now = new Date()) {
  const at = now.toISOString();
  return updateIndex(me, other, (entry) =>
    entry?.lastAt && entry.lastFrom !== me && (!entry.readAt || entry.readAt < entry.lastAt)
      ? { ...entry, readAt: at, changedAt: at }
      : null
  );
}

/** Delete one of your own messages in the conversation with `other`. */
export async function deleteMessage(
  actor: Person,
  other: string,
  messageId: string,
  now = new Date()
): Promise<{ ok: true } | { ok: false; reason: Failure }> {
  const result = await mutateJson<ChatMessage[] | Failure>(
    conversationKey(actor.personId, other),
    (raw) => {
      const removed = deleteComment(messagesOf(raw), messageId, { ...actor, canModerate: false });
      if (typeof removed === "string")
        return { write: false, result: removed === "forbidden" ? "forbidden" : "not_found" };
      return { value: { messages: removed.comments }, result: removed.comments };
    }
  );
  if (typeof result === "string") return { ok: false, reason: result };
  const at = now.toISOString();
  const last = { ...lastOf(result), changedAt: at };
  await Promise.all([
    updateIndex(actor.personId, other, (entry) => (entry ? { ...entry, ...last } : null)),
    updateIndex(other, actor.personId, (entry) => (entry ? { ...entry, ...last } : null)),
  ]);
  return { ok: true };
}

/** Someone's left the directory: their list of conversations goes (what they sent stays). */
export const deleteChatIndex = (personId: string) => deleteJson(indexKey(personId));

/** The later of two index entries for the same conversation, read up to whichever read it later. */
function laterEntry(
  a: ConversationEntry | undefined,
  b: ConversationEntry | undefined,
  withId: string
) {
  if (!a) return b && { ...b, with: withId };
  if (!b) return { ...a, with: withId };
  const newer = (a.lastAt ?? "") >= (b.lastAt ?? "") ? a : b;
  const readAt = [a.readAt, b.readAt].filter(Boolean).sort().pop() ?? null;
  return { ...newer, with: withId, readAt, changedAt: new Date().toISOString() };
}

/**
 * A duplicate directory entry has been combined into another: move its
 * conversations (and the other people's entries for them) to the kept
 * entry, joining any both had with the same person; its own index goes.
 */
export async function mergeChat(duplicate: string, keep: string) {
  if (duplicate === keep) return;
  const prefix = "chat/conversations/";
  const others = (await listKeys(prefix))
    .map((object) =>
      object.key
        .slice(prefix.length)
        .replace(/\.json$/, "")
        .split("-")
    )
    .filter((ids) => ids.length === 2 && ids.includes(duplicate))
    .map(([a, b]) => (a === duplicate ? b : a));
  for (const other of others) {
    if (other === keep) {
      await deleteJson(conversationKey(duplicate, keep));
      continue;
    }
    const moved = messagesOf(await readJson(conversationKey(duplicate, other))).map((message) =>
      message.authorPersonId === duplicate ? { ...message, authorPersonId: keep } : message
    );
    await mutateJson(conversationKey(keep, other), (raw) => {
      const seen = new Set<string>();
      const messages = [...messagesOf(raw), ...moved]
        .filter((message) => !seen.has(message.id) && seen.add(message.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-MAX_MESSAGES);
      return { value: { messages }, result: null };
    });
    await deleteJson(conversationKey(duplicate, other));
    // The other person's entry for the duplicate becomes their entry for the kept one.
    await mutateJson(indexKey(other), (raw) => {
      const index = indexOf(raw);
      if (!index[duplicate]) return { write: false, result: null };
      const { [duplicate]: old, ...rest } = index;
      const joined = laterEntry(old, rest[keep], keep)!;
      return {
        value: {
          conversations: {
            ...rest,
            [keep]: { ...joined, lastFrom: joined.lastFrom === duplicate ? keep : joined.lastFrom },
          },
        },
        result: null,
      };
    });
  }
  const dupIndex = await readIndex(duplicate);
  if (Object.keys(dupIndex).length)
    await mutateJson(indexKey(keep), (raw) => {
      const index = { ...indexOf(raw) };
      for (const [other, entry] of Object.entries(dupIndex)) {
        if (other === keep) continue;
        const joined = laterEntry(entry, index[other], other)!;
        index[other] = {
          ...joined,
          lastFrom: joined.lastFrom === duplicate ? keep : joined.lastFrom,
        };
      }
      return { value: { conversations: index }, result: null };
    });
  await deleteJson(indexKey(duplicate));
}
