import type { CommentRecord } from "@/lib/comments/shared";
import type { Poll } from "@/lib/polls/shared";

/**
 * Circle forums — types and pure helpers, safe for the browser.
 *
 * A circle's Forum holds its conversations: a title and a flat list of
 * messages (the first is its opening), which can carry a poll. Members hear
 * about new messages by app notification. Messages marked "by email" came
 * from the group email the app once had, and are kept as they were.
 */

export type Via = "web" | "email";

/** One message in a conversation (the first is the opening one). */
export type GroupPost = CommentRecord & {
  via: Via;
  /** Attachments sent by email that weren't kept (shown as a note). */
  skippedAttachments?: number;
};

export interface GroupThread {
  id: string;
  circleId: string;
  title: string;
  createdAt: string;
  lastAt: string;
  hasPoll?: boolean;
}

/** A conversation as the Forum module lists it. */
export interface ThreadSummary {
  id: string;
  title: string;
  authorName: string;
  createdAt: string;
  lastAt: string;
  lastBy: string;
  count: number;
  via: Via;
  hasPoll: boolean;
  excerpt: string;
}

/** A conversation's poll (one per conversation): its question is the conversation's title. */
export interface GroupPoll {
  threadId: string;
  circleId: string;
  /** Votes are keyed by directory person id (`PollVote.userId` holds it). */
  poll: Poll;
  authorPersonId: string | null;
}

/** The first words of a message, for lists. */
export const excerptOf = (text: string, length = 140) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};
