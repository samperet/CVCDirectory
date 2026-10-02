"use client";

import { createContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPoll } from "@/lib/polls/wiki";
import { PollView } from "@/components/polls/poll-view";

/** A poll, with what you can do with it. */
export type PollEntry = WikiPoll & { circleName: string; canClose: boolean; canVote: boolean };
export type PollsResponse = { polls: PollEntry[] };

/** The wiki's polls — one request for every poll on a page. */
export const wikiPollsQuery = () => ({
  queryKey: ["wiki-polls"],
  queryFn: () => apiFetch<PollsResponse>("/api/wiki/polls"),
});

/** The circle that keeps the page being shown, and the page itself (for its polls, photos, and embeds). */
export const WikiCircleContext = createContext<{
  circleId: string;
  circleName?: string;
  pageSlug?: string;
} | null>(null);

/** A poll in a wiki page: its question and details, then voting or results. */
export function WikiPollBlock({ pollId }: { pollId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(wikiPollsQuery());
  if (isLoading || !data)
    return <div className="my-2 h-24 animate-pulse rounded-lg bg-accent/40" aria-hidden />;
  const entry = data.polls.find((poll) => poll.id === pollId.toLowerCase());
  if (!entry)
    return (
      <p className="my-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">
        This poll is no longer available.
      </p>
    );
  const url = `/api/wiki/polls/${entry.id}`;
  // Votes and closing return the updated poll, which goes straight into the list.
  const request = async (method: "POST" | "PATCH", body: object) => {
    const { poll } = await apiFetch<{ poll: PollEntry }>(url, {
      method,
      body: JSON.stringify(body),
    });
    queryClient.setQueryData<PollsResponse>(wikiPollsQuery().queryKey, (current) =>
      current
        ? {
            ...current,
            polls: current.polls.map((candidate) => (candidate.id === poll.id ? poll : candidate)),
          }
        : current
    );
  };
  const canClose = entry.canClose;
  return (
    <div className="not-prose my-2 flex flex-col gap-2 rounded-xl border border-border bg-white/80 p-4">
      <div>
        <h3 className="flex items-start gap-2 font-semibold text-foreground">
          <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{" "}
          {entry.question}
        </h3>
        <p className="text-xs text-muted">
          Asked by {entry.authorName}
          {entry.membersOnly ? ` · ${entry.circleName} members vote` : ""}
        </p>
      </div>
      {entry.details ? (
        <p className="whitespace-pre-wrap text-sm text-foreground-light">{entry.details}</p>
      ) : null}
      <PollView
        id={entry.id}
        poll={entry.poll}
        canClose={canClose}
        onVote={(optionIds, newOption) => request("POST", { optionIds, newOption })}
        onSetClosed={(closed) => request("PATCH", { closed })}
        cantVoteReason={
          entry.canVote ? null : `Only ${entry.circleName}'s members vote in this poll`
        }
      />
    </div>
  );
}
