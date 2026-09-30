"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { CommunityPoll } from "@/lib/polls/community";
import { timeAgo } from "@/lib/time";
import { PollFields, draftOptions, emptyPollDraft, pollPayload } from "@/components/polls/poll-fields";
import { PollView } from "@/components/polls/poll-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const KEY = ["community", "polls"];

function NewPollForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [details, setDetails] = useState("");
  const [draft, setDraft] = useState(emptyPollDraft);
  const ready = question.trim().length >= 3 && draftOptions(draft).length >= 2;
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ poll: CommunityPoll }>("/api/community/polls", {
        method: "POST",
        body: JSON.stringify({ question, details, poll: pollPayload(draft) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Poll posted" });
      onDone();
    },
    onError: (error: Error) => toast({ title: "Could not post the poll", description: error.message, variant: "destructive" }),
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-white/60 p-4">
      <Input placeholder="Question, e.g. Which Saturday for the fall work day?" value={question} maxLength={160} onChange={(e) => setQuestion(e.target.value)} aria-label="Question" className="bg-white" />
      <Textarea rows={2} placeholder="Add some context (optional)" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} className="bg-white" />
      <PollFields draft={draft} onChange={setDraft} />
      <div className="flex gap-2">
        <Button onClick={() => create.mutate()} disabled={!ready || create.isPending}>
          {create.isPending ? "Posting…" : "Post poll"}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PollItem({ entry }: { entry: CommunityPoll }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const mine = !!user && (entry.authorId === user.id || !!user.isAdmin);
  // Votes and closing return the updated poll, which goes straight into the list.
  const request = async (method: "POST" | "PATCH", body: object) => {
    const { poll } = await apiFetch<{ poll: CommunityPoll }>(`/api/community/polls/${entry.id}`, { method, body: JSON.stringify(body) });
    queryClient.setQueryData<{ polls: CommunityPoll[] }>(KEY, (current) =>
      current ? { polls: current.polls.map((candidate) => (candidate.id === poll.id ? poll : candidate)) } : current
    );
  };
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/community/polls/${entry.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Poll deleted" });
    },
    onError: (error: Error) => toast({ title: "Could not delete the poll", description: error.message, variant: "destructive" }),
  });
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{entry.question}</h3>
          <p className="text-xs text-muted">
            {entry.authorName} · {timeAgo(entry.createdAt)}
          </p>
        </div>
        {mine ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted hover:text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Delete this poll and its votes?")) remove.mutate();
            }}
            aria-label="Delete poll"
            title="Delete poll"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      {entry.details ? <p className="whitespace-pre-wrap text-sm text-foreground-light">{entry.details}</p> : null}
      <PollView
        id={entry.id}
        poll={entry.poll}
        canClose={mine}
        onVote={(optionIds) => request("POST", { optionIds })}
        onSetClosed={(closed) => request("PATCH", { closed })}
      />
    </li>
  );
}

/** The Community page's polls: any resident asks everyone a question. */
export function CommunityPolls() {
  const { user } = useSession();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<{ polls: CommunityPoll[] }>("/api/community/polls"),
  });
  const polls = data?.polls ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden /> Polls
          </h2>
          <p className="text-sm text-muted">Ask everyone at CVC a question.</p>
        </div>
        {user ? (
          <Button className="gap-1" variant={creating ? "outline" : "default"} onClick={() => setCreating((value) => !value)}>
            {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {creating ? "Cancel" : "Create a poll"}
          </Button>
        ) : null}
      </div>
      {creating ? <NewPollForm onDone={() => setCreating(false)} /> : null}
      {isLoading ? (
        <p className="text-sm text-muted">Loading polls…</p>
      ) : error ? (
        <p className="text-sm text-foreground">{(error as Error).message}</p>
      ) : polls.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {polls.map((entry) => (
            <PollItem key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No polls yet.</p>
      )}
    </div>
  );
}
