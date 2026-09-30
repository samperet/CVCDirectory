import type { ForumPoll } from "./store";

/** Poll rules shared by the server and the browser. */
export const MAX_POLL_OPTIONS = 10;

/** Whether a poll still takes votes. */
export function pollIsOpen(poll: ForumPoll, now = Date.now()) {
  return !poll.closedAt && (!poll.closesAt || Date.parse(poll.closesAt) > now);
}
