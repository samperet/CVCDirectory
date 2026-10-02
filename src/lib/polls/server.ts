import { randomUUID } from "crypto";
import { z } from "zod";
import {
  MAX_POLL_OPTIONS,
  MAX_POLL_OPTIONS_WITH_ADDED,
  Poll,
  VoteFailure,
  pollIsOpen,
} from "./shared";

/** Creating, voting in, and closing polls — the parts that don't depend on where a poll lives. */

export const pollInputSchema = z.object({
  options: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Poll options can't be empty")
        .max(120, "Poll options must be 120 characters or fewer")
    )
    .min(2, "A poll needs at least two options")
    .max(MAX_POLL_OPTIONS, `A poll can have up to ${MAX_POLL_OPTIONS} options`)
    .refine(
      (options) => new Set(options.map((option) => option.toLowerCase())).size === options.length,
      "Poll options must be different"
    ),
  multiple: z.boolean().default(false),
  allowOther: z.boolean().default(false),
  closesAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((value) => value ?? null)
    .refine(
      (value) => !value || Date.parse(value) > Date.now(),
      "Choose a closing time in the future"
    ),
});
export type PollInput = z.infer<typeof pollInputSchema>;

export const voteSchema = z.object({
  optionIds: z.array(z.string().uuid()).max(MAX_POLL_OPTIONS_WITH_ADDED),
  /** An option of your own to add and vote for, where the poll allows it. */
  newOption: z
    .string()
    .trim()
    .min(1, "Write your option")
    .max(120, "Options must be 120 characters or fewer")
    .optional(),
});
export const pollUpdateSchema = z.object({ closed: z.boolean() });

export function newPoll(input: PollInput): Poll {
  return {
    options: input.options.map((text) => ({ id: randomUUID(), text })),
    multiple: input.multiple,
    allowOther: input.allowOther,
    closesAt: input.closesAt,
    closedAt: null,
    votes: [],
  };
}

/**
 * A vote, replacing the voter's earlier one; no options takes it back. One
 * option unless the poll allows several. `newOption` adds an option of the
 * voter's own (where the poll allows it) and votes for it — or, if it matches
 * one already there, votes for that.
 */
export function castVote(
  poll: Poll,
  user: { id: string; name: string },
  optionIds: string[],
  newOption?: string
): Poll | VoteFailure {
  if (!pollIsOpen(poll)) return "poll_closed";
  let options = poll.options;
  let chosen = Array.from(new Set(optionIds));
  if (newOption) {
    if (!poll.allowOther) return "no_new_options";
    const existing = options.find(
      (option) => option.text.trim().toLowerCase() === newOption.toLowerCase()
    );
    let id = existing?.id;
    if (!id) {
      if (options.length >= MAX_POLL_OPTIONS_WITH_ADDED) return "options_full";
      id = randomUUID();
      options = [...options, { id, text: newOption, addedBy: user.name }];
    }
    chosen = poll.multiple ? Array.from(new Set([...chosen, id])) : [id];
  }
  if (chosen.some((id) => !options.some((option) => option.id === id))) return "invalid_vote";
  if (!poll.multiple && chosen.length > 1) return "invalid_vote";
  const others = poll.votes.filter((entry) => entry.userId !== user.id);
  return {
    ...poll,
    options,
    votes: chosen.length
      ? [...others, { userId: user.id, name: user.name, optionIds: chosen }]
      : others,
  };
}

/** Close a poll, or reopen it (clearing a closing time that has passed). */
export function withClosed(poll: Poll, closed: boolean): Poll {
  const expired = !!poll.closesAt && Date.parse(poll.closesAt) <= Date.now();
  return closed
    ? { ...poll, closedAt: poll.closedAt ?? new Date().toISOString() }
    : { ...poll, closedAt: null, closesAt: expired ? null : poll.closesAt };
}
