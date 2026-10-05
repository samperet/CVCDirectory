import type { CommentRecord } from "@/lib/comments/shared";
import type { Poll } from "@/lib/polls/shared";

/**
 * Circle email groups — types and pure helpers, safe for the browser.
 *
 * Every circle (and club) has a group address on the community's domain:
 * the one it chose, or else made from its name (`landcare@` for "Land Care
 * Circle"); its id works too, and so does any address it had before.
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

/** The domain group addresses are on, as the browser knows it (the server's is `mailDomain()`). */
export const DEFAULT_MAIL_DOMAIN = "commonpasturesvt.org";
export const publicMailDomain = () =>
  process.env.NEXT_PUBLIC_GROUP_EMAIL_DOMAIN || DEFAULT_MAIL_DOMAIN;

type Addressed = { id: string; name: string; emailName?: string | null };

/** A circle's group address part: the one it chose, else from its name, else its id. */
export const groupLocal = (circle: Addressed) =>
  circle.emailName || localPartOf(circle.name) || circle.id.replace(/-/g, "");

/** The address people write to. */
export const groupAddress = (circle: Addressed, domain: string) =>
  `${groupLocal(circle)}@${domain}`;

/** Addresses no circle may have: the mail system's own, and the app's. */
export const RESERVED_LOCALS = new Set([
  "postmaster",
  "abuse",
  "hostmaster",
  "webmaster",
  "admin",
  "administrator",
  "root",
  "noreply",
  "no-reply",
  "notifications",
  "bounces",
  "mailer-daemon",
  "dmarc",
  "security",
  "support",
  "help",
]);

/** Why a chosen address part can't be used, or null if it can (pure, for tests). */
export function emailNameProblem(value: string): string | null {
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(value) || value.length < 2 || value.length > 40)
    return "Use 2–40 lowercase letters and numbers (dots and dashes in the middle are fine)";
  if (RESERVED_LOCALS.has(value) || RESERVED_LOCALS.has(normalizeLocal(value)))
    return "That address is kept for the mail system — choose another";
  return null;
}

/** Whether another circle already answers to an address part (by its address, its id, or an old address). */
export function addressTaken(
  value: string,
  circleId: string,
  circles: Addressed[],
  aliases: Record<string, string>
) {
  const key = normalizeLocal(value);
  return (
    circles.some(
      (circle) =>
        circle.id !== circleId &&
        (normalizeLocal(groupLocal(circle)) === key || normalizeLocal(circle.id) === key)
    ) ||
    (!!aliases[key] && aliases[key] !== circleId)
  );
}

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
