import { deleteJson, mutateJson, readJson } from "@/lib/storage";
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
 * deletes a message. A conversation keeps its latest `MAX_MESSAGES`.
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
