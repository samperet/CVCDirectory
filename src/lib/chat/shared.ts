import type { CommentRecord } from "@/lib/comments/shared";

/**
 * Private messages between two residents — types and pure helpers, safe for
 * the browser. A conversation is between two directory people (its id is
 * their two ids, sorted); its messages are comments with no replies. Each
 * person has an index of their conversations — who with, the last message,
 * and when they last read it — which says what's unread.
 */

export type ChatMessage = CommentRecord;

/** One of your conversations, as your index keeps it. */
export interface ConversationEntry {
  /** The other person's directory id. */
  with: string;
  /** When the last message was sent (null once every message is deleted). */
  lastAt: string | null;
  lastExcerpt: string;
  /** Who sent the last message (a person id). */
  lastFrom: string | null;
  /** When you last read it. */
  readAt: string | null;
  /** When this entry last changed: a poll that knows it can skip reading the messages. */
  changedAt: string;
}

/** Keyed by the other person's id. */
export type ChatIndex = Record<string, ConversationEntry>;

export const MAX_MESSAGE = 2000;
/** A conversation keeps its most recent messages. */
export const MAX_MESSAGES = 500;

/** The conversation between two people, whichever way round they're named. */
export const conversationId = (a: string, b: string) => [a, b].sort().join("-");

export const isUnread = (entry: ConversationEntry, me: string) =>
  !!entry.lastAt && entry.lastFrom !== me && (!entry.readAt || entry.readAt < entry.lastAt);

export const unreadCount = (index: ChatIndex, me: string) =>
  Object.values(index).filter((entry) => isUnread(entry, me)).length;

/** The newest change to any of your conversations: when it moves, there's something new. */
export const latestChange = (index: ChatIndex) =>
  Object.values(index).reduce<string | null>(
    (latest, entry) => (!latest || entry.changedAt > latest ? entry.changedAt : latest),
    null
  );

/** A conversation as the Messages page shows it. */
export interface ConversationView {
  with: string;
  messages: ChatMessage[];
  entry: ConversationEntry | null;
}

/** What a check-in answers: who's online, and your unread conversations. */
export interface PresenceView {
  online: string[];
  unread: number;
  latestAt: string | null;
}
