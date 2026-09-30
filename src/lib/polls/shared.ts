/** Polls — on forum discussions and on the Community page. Types and rules shared by the server and the browser. */

export interface PollOption {
  id: string;
  text: string;
}

/** One resident's vote (their account and name, and the options they chose). */
export interface PollVote {
  userId: string;
  name: string;
  optionIds: string[];
}

/**
 * A poll's options and votes (its question lives with whatever holds it).
 * Options are fixed once it's posted. It closes at `closesAt`, if set, or
 * when its author (or an admin) closes it.
 */
export interface Poll {
  options: PollOption[];
  multiple: boolean;
  closesAt?: string | null;
  closedAt?: string | null;
  votes: PollVote[];
}

export const MAX_POLL_OPTIONS = 10;

/** Whether a poll still takes votes. */
export function pollIsOpen(poll: Poll, now = Date.now()) {
  return !poll.closedAt && (!poll.closesAt || Date.parse(poll.closesAt) > now);
}
