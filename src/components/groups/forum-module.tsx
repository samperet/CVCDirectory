"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Mail, MessageSquarePlus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { ThreadSummary } from "@/lib/groups/shared";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/ui/pill";
import { Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";
import {
  PollFields,
  emptyPollDraft,
  draftOptions,
  pollPayload,
} from "@/components/polls/poll-fields";

export type ForumData = {
  threads: ThreadSummary[];
  canPost: boolean;
  canModerate: boolean;
  member: boolean;
};

export const forumQuery = (circleId: string) => ({
  queryKey: ["group-forum", circleId],
  queryFn: () => apiFetch<ForumData>(`/api/circles/${circleId}/forum`),
});

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * A circle's Forum module: starting a conversation (with an optional poll)
 * and the conversations. Members hear about new messages by app
 * notification; everyone at CVC can read them. Conversations marked with
 * the envelope came from the group email the app once had.
 */
export function ForumModule({ circleId, circleName }: { circleId: string; circleName: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery(forumQuery(circleId));
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pollDraft, setPollDraft] = useState<ReturnType<typeof emptyPollDraft> | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["group-forum", circleId] });
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });

  const start = useMutation({
    mutationFn: () =>
      apiFetch(`/api/circles/${circleId}/forum`, {
        method: "POST",
        body: JSON.stringify({
          title,
          body,
          ...(pollDraft && draftOptions(pollDraft).length >= 2
            ? { poll: pollPayload(pollDraft) }
            : {}),
        }),
      }),
    onSuccess: () => {
      setWriting(false);
      setTitle("");
      setBody("");
      setPollDraft(null);
      refresh();
      toast({ title: "Posted", description: `${circleName}'s members will get a notification.` });
    },
    onError: fail("Could not post"),
  });
  if (isLoading) return <Loading />;
  if (error || !data) return <p className="text-sm text-foreground">{(error as Error)?.message}</p>;

  return (
    <div className="flex flex-col gap-4" data-forum>
      <p className="text-xs text-muted">
        {circleName}&apos;s members get a notification in the app for each new message. Everyone at
        CVC can read it here.
      </p>

      {data.canPost ? (
        writing ? (
          <form
            className="flex flex-col gap-2 rounded-lg border border-border bg-white p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim() && body.trim()) start.mutate();
            }}
          >
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Subject"
              aria-label="Subject"
              maxLength={160}
              className="bg-white"
              autoFocus
            />
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={`Write to ${circleName}…`}
              aria-label="Message"
              rows={5}
              className="bg-white"
            />
            {pollDraft ? <PollFields draft={pollDraft} onChange={setPollDraft} /> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={start.isPending || !title.trim() || !body.trim()}>
                {start.isPending ? "Posting…" : "Post"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-1"
                onClick={() => setPollDraft(pollDraft ? null : emptyPollDraft())}
              >
                <BarChart3 className="h-4 w-4" /> {pollDraft ? "No poll" : "Add a poll"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setWriting(false)}>
                Cancel
              </Button>
            </div>
            {pollDraft ? (
              <p className="text-xs text-muted">
                The subject is the poll&apos;s question; members answer it in the conversation.
              </p>
            ) : null}
          </form>
        ) : (
          <Button className="w-fit gap-1.5" onClick={() => setWriting(true)}>
            <MessageSquarePlus className="h-4 w-4" /> Start a conversation
          </Button>
        )
      ) : null}

      {data.threads.length ? (
        <ul className="flex flex-col divide-y divide-border" aria-label="Conversations">
          {data.threads.map((thread) => (
            <li key={thread.id} className="flex flex-col gap-0.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/circles/${circleId}/forum/${thread.id}`}
                  className="min-w-0 font-medium text-foreground hover:underline"
                >
                  {thread.title}
                </Link>
                {thread.hasPoll ? (
                  <Pill size="xs" tone="sun">
                    <BarChart3 className="h-3 w-3" aria-hidden /> Poll
                  </Pill>
                ) : null}
                {thread.via === "email" ? (
                  <Mail className="h-3.5 w-3.5 text-muted" aria-label="Started by email" />
                ) : null}
              </div>
              <p className="text-xs text-muted">
                {thread.authorName} · {plural(thread.count, "message")} · last from {thread.lastBy}{" "}
                {timeAgo(thread.lastAt)}
              </p>
              {thread.excerpt ? (
                <p className="line-clamp-2 text-sm text-foreground-light">{thread.excerpt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No conversations yet{data.canPost ? " — start one." : "."}
        </p>
      )}
    </div>
  );
}
