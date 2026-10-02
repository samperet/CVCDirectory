"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BarChart3, Check, Lock } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { type Poll, pollIsOpen } from "@/lib/polls/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

function ActionLink({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "font-medium hover:underline",
        danger ? "text-muted hover:text-destructive" : "text-secondary-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** "Sam Peret, Alex Kim and 3 others" — who chose an option. */
function votersLabel(names: string[]) {
  if (names.length <= 3) return names.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * A poll: choose and vote (or change your vote) while it's open; results —
 * counts, bars, and who chose what — once you've voted, or when it's closed.
 * Where the poll allows it, a voter can add an option of their own (and
 * vote for it). Its author or an admin can close and reopen it. Where the
 * poll lives (a forum discussion, a circle's page) supplies how to vote and
 * close it — and, for a members-only poll, whether you can vote.
 */
export function PollView({
  id,
  poll,
  canClose,
  onVote,
  onSetClosed,
  cantVoteReason,
}: {
  /** Unique on the page, for the radio group. */
  id: string;
  poll: Poll;
  canClose: boolean;
  onVote: (optionIds: string[], newOption?: string) => Promise<unknown>;
  onSetClosed: (closed: boolean) => Promise<unknown>;
  /** Set when you can't vote in this poll: why (shown with the results). */
  cantVoteReason?: string | null;
}) {
  const { toast } = useToast();
  const { user } = useSession();
  const mine = poll.votes.find((entry) => entry.userId === user?.id)?.optionIds ?? [];
  const open = pollIsOpen(poll);
  const [choosing, setChoosing] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [selected, setSelected] = useState<string[]>(mine);
  const [newOption, setNewOption] = useState("");
  const [addingOwn, setAddingOwn] = useState(false);
  const canVote = !cantVoteReason;
  const showResults = !open || !canVote || peeking || (mine.length > 0 && !choosing);
  const ownText = addingOwn ? newOption.trim() : "";
  const voters = poll.votes.length;

  const submit = useMutation({
    mutationFn: ({ optionIds, newOption }: { optionIds: string[]; newOption?: string }) =>
      onVote(optionIds, newOption),
    onError: (error: Error) =>
      toast({
        title: "Could not save your vote",
        description: error.message,
        variant: "destructive",
      }),
  });
  const close = useMutation({
    mutationFn: onSetClosed,
    onError: (error: Error) =>
      toast({
        title: "Could not update the poll",
        description: error.message,
        variant: "destructive",
      }),
  });
  const toggle = (id: string) => {
    if (!poll.multiple) setAddingOwn(false);
    setSelected((current) =>
      poll.multiple
        ? current.includes(id)
          ? current.filter((entry) => entry !== id)
          : [...current, id]
        : [id]
    );
  };
  const chooseOwn = (on: boolean) => {
    setAddingOwn(on);
    if (on && !poll.multiple) setSelected([]);
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-accent/40 p-4"
      aria-label="Poll"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <BarChart3 className="h-4 w-4 text-primary" />
        {poll.multiple ? "Poll · choose any" : "Poll · choose one"}
      </p>

      {showResults ? (
        <ul className="flex flex-col gap-2.5">
          {poll.options.map((option) => {
            const names = poll.votes
              .filter((entry) => entry.optionIds.includes(option.id))
              .map((entry) => (entry.userId === user?.id ? "You" : entry.name));
            const share = voters ? Math.round((names.length / voters) * 100) : 0;
            const chosen = mine.includes(option.id);
            return (
              <li key={option.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span
                    className={cn(
                      "flex items-center gap-1 text-foreground",
                      chosen && "font-semibold"
                    )}
                  >
                    {chosen ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Your choice" />
                    ) : null}
                    {option.text}
                    {option.addedBy ? (
                      <span className="text-xs font-normal text-muted">
                        · added by {option.addedBy}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {names.length} · {share}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      chosen ? "bg-primary" : "bg-primary/50"
                    )}
                    style={{ width: `${share}%` }}
                  />
                </div>
                {names.length ? <p className="text-xs text-muted">{votersLabel(names)}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="sr-only">
            {poll.multiple ? "Choose any options" : "Choose one option"}
          </legend>
          {poll.options.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3 py-2 text-sm text-foreground transition",
                selected.includes(option.id)
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-primary/60"
              )}
            >
              <input
                type={poll.multiple ? "checkbox" : "radio"}
                name={`poll-${id}`}
                checked={selected.includes(option.id)}
                onChange={() => toggle(option.id)}
                className="h-4 w-4 accent-primary"
              />
              <span>
                {option.text}
                {option.addedBy ? (
                  <span className="text-xs text-muted"> · added by {option.addedBy}</span>
                ) : null}
              </span>
            </label>
          ))}
          {poll.allowOther ? (
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed bg-white px-3 py-1.5 text-sm text-foreground transition",
                addingOwn
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-primary/60"
              )}
            >
              <input
                type={poll.multiple ? "checkbox" : "radio"}
                name={`poll-${id}`}
                checked={addingOwn}
                onChange={(event) => chooseOwn(poll.multiple ? event.target.checked : true)}
                className="h-4 w-4 accent-primary"
                aria-label="Add your own option"
              />
              <Input
                value={newOption}
                maxLength={120}
                placeholder="Add your own option…"
                onFocus={() => chooseOwn(true)}
                onChange={(event) => {
                  setNewOption(event.target.value);
                  if (!addingOwn) chooseOwn(true);
                }}
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                aria-label="Your own option"
              />
            </label>
          ) : null}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        {!showResults ? (
          <Button
            size="sm"
            disabled={(!selected.length && !ownText) || submit.isPending}
            onClick={() =>
              submit.mutate(
                { optionIds: selected, ...(ownText ? { newOption: ownText } : {}) },
                {
                  onSuccess: () => {
                    setChoosing(false);
                    setAddingOwn(false);
                    setNewOption("");
                  },
                }
              )
            }
          >
            {submit.isPending ? "Saving…" : mine.length ? "Save vote" : "Vote"}
          </Button>
        ) : null}
        {open && !showResults && choosing ? (
          <ActionLink
            onClick={() => {
              setSelected(mine);
              setChoosing(false);
            }}
          >
            Cancel
          </ActionLink>
        ) : null}
        {open && !showResults && !mine.length ? (
          <ActionLink onClick={() => setPeeking(true)}>See results</ActionLink>
        ) : null}
        {open && peeking && !mine.length ? (
          <ActionLink onClick={() => setPeeking(false)}>Back to voting</ActionLink>
        ) : null}
        {open && canVote && showResults && mine.length && !peeking ? (
          <>
            <ActionLink
              onClick={() => {
                setSelected(mine);
                setChoosing(true);
              }}
            >
              Change vote
            </ActionLink>
            <ActionLink
              danger
              onClick={() => submit.mutate({ optionIds: [] }, { onSuccess: () => setSelected([]) })}
            >
              Take back vote
            </ActionLink>
          </>
        ) : null}
        {open && cantVoteReason ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden /> {cantVoteReason}
          </span>
        ) : null}
        <span className="text-muted">
          {voters} {voters === 1 ? "person has" : "people have"} voted
          {" · "}
          {open ? (poll.closesAt ? `closes ${shortDate(poll.closesAt)}` : "open") : "closed"}
        </span>
        {canClose ? (
          <ActionLink onClick={() => close.mutate(open)}>
            {close.isPending ? "Saving…" : open ? "Close poll" : "Reopen poll"}
          </ActionLink>
        ) : null}
      </div>
    </section>
  );
}
