import type { CommentRecord } from "@/lib/comments/shared";
import type { Poll } from "@/lib/polls/shared";

/**
 * Circle email groups — types and pure helpers, safe for the browser.
 *
 * Every circle (and club) has a group address on the community's domain,
 * made from its name (`landcare@` for "Land Care Circle"; its id works too).
 * Writing to it starts a conversation in the circle's Forum, and every
 * message in a conversation — written in the app or sent by email — goes
 * to the circle's current members by email (unless they chose the web
 * only), with replies going back to the group. A conversation is a title
 * and a flat list of messages (the first is its opening), like an email
 * thread; it can carry a poll.
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
  /** The message ids of emails that became messages here, to recognise replies to them. */
  emailIds?: string[];
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
  /** Votes are keyed by directory person id (`PollVote.userId` holds it), so email and web votes are one. */
  poll: Poll;
  authorPersonId: string | null;
}

/** How a member gets a circle's messages: each by email, or only on the web. */
export type Delivery = "each" | "web";

/** A message waiting for a moderator: from someone who isn't a member, or that couldn't be verified. */
export interface HeldMessage {
  id: string;
  circleId: string;
  at: string;
  fromEmail: string;
  fromName: string;
  /** The resident it's from, if the address is theirs. */
  personId: string | null;
  subject: string;
  text: string;
  /** The conversation it replies to, if any. */
  threadId: string | null;
  reason: "not_member" | "outsider" | "unverified";
}

const GENERIC_WORDS = /\b(circle|committee|team|group|club)\b/gi;

/** A name as an address part: lowercase letters and digits only. */
export const localPartOf = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(GENERIC_WORDS, " ")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);

/** An address part as typed, made comparable: case, dots, dashes and underscores don't matter. */
export const normalizeLocal = (local: string) => local.toLowerCase().replace(/[-._]/g, "");

/** A circle's group address part: from its name, or its id if the name has nothing usable. */
export const groupLocal = (circle: { id: string; name: string }) =>
  localPartOf(circle.name) || circle.id.replace(/-/g, "");

/** The address people write to. */
export const groupAddress = (circle: { id: string; name: string }, domain: string) =>
  `${groupLocal(circle)}@${domain}`;

/** A subject without Re:/Fwd: and the circle's [tag], for a conversation's title. */
export function cleanSubject(subject: string): string {
  let value = subject.trim();
  for (let i = 0; i < 6; i++) {
    const next = value
      .replace(/^(re|fw|fwd|aw|sv|antw)\s*(\[\d+\])?\s*:\s*/i, "")
      .replace(/^\[[^\]]{1,60}\]\s*/, "")
      .replace(/^\[test\]\s*/i, "")
      .trim();
    if (next === value) break;
    value = next;
  }
  return value.slice(0, 160);
}

/** A circle's initials, for when it has no icon. */
export const circleInitials = (name: string) =>
  name
    .replace(GENERIC_WORDS, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join("") || "C";

/** The first words of a message, for lists. */
export const excerptOf = (text: string, length = 140) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};
