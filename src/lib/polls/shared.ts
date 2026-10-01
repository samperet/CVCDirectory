/** Polls (in wiki pages): types and rules shared by the server and the browser. */

export interface PollOption {
  id: string;
  text: string;
  /** Who added it, for an option a voter added (see `allowOther`). */
  addedBy?: string | null;
}

/** One resident's vote (their account and name, and the options they chose). */
export interface PollVote {
  userId: string;
  name: string;
  optionIds: string[];
}

/**
 * A poll's options and votes (its question lives with whatever holds it).
 * Its author's options are fixed once it's posted; with `allowOther`, voters
 * can add their own (voting for what they add). It closes at `closesAt`, if
 * set, or when its author (or an admin) closes it.
 */
export interface Poll {
  options: PollOption[];
  multiple: boolean;
  /** Voters may add options of their own. */
  allowOther?: boolean;
  closesAt?: string | null;
  closedAt?: string | null;
  votes: PollVote[];
}

export const MAX_POLL_OPTIONS = 10;
/** Options in all, counting those voters add. */
export const MAX_POLL_OPTIONS_WITH_ADDED = 30;

/** Why a vote couldn't be saved. */
export type VoteFailure = "poll_closed" | "invalid_vote" | "no_new_options" | "options_full";

/** Whether a poll still takes votes. */
export function pollIsOpen(poll: Poll, now = Date.now()) {
  return !poll.closedAt && (!poll.closesAt || Date.parse(poll.closesAt) > now);
}
