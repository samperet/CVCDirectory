"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, Copy, Mail, MessageSquarePlus, ShieldQuestion, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Delivery, HeldMessage, ThreadSummary } from "@/lib/groups/shared";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/ui/pill";
import { SegmentedControl } from "@/components/ui/segmented";
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
  address: string;
  emailOn: boolean;
  canPost: boolean;
  canModerate: boolean;
  member: boolean;
  myDelivery: Delivery;
  reach: { email: number; webOnly: number; noEmail: number };
  held: HeldMessage[];
};

export const forumQuery = (circleId: string) => ({
  queryKey: ["group-forum", circleId],
  queryFn: () => apiFetch<ForumData>(`/api/circles/${circleId}/forum`),
});

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * A circle's Forum module: its email address (anyone can copy it), how you
 * get its messages, starting a conversation (with an optional poll), what's
 * waiting for approval, and the conversations — each written on the web or
 * by email, and emailed to every member who wants them.
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
      apiFetch<{ emailed: { sent: number; overQuota: number } | null }>(
        `/api/circles/${circleId}/forum`,
        {
          method: "POST",
          body: JSON.stringify({
            title,
            body,
            ...(pollDraft && draftOptions(pollDraft).length >= 2
              ? { poll: pollPayload(pollDraft) }
              : {}),
          }),
        }
      ),
    onSuccess: ({ emailed }) => {
      setWriting(false);
      setTitle("");
      setBody("");
      setPollDraft(null);
      refresh();
      toast({
        title: "Posted",
        description: emailed
          ? `Emailed to ${plural(emailed.sent, "member")}${
              emailed.overQuota ? `; ${emailed.overQuota} will get it in tomorrow's summary` : ""
            }.`
          : undefined,
      });
    },
    onError: fail("Could not post"),
  });
  const delivery = useMutation({
    mutationFn: (value: Delivery) =>
      apiFetch(`/api/circles/${circleId}/forum`, {
        method: "PATCH",
        body: JSON.stringify({ delivery: value }),
      }),
    onSuccess: refresh,
    onError: fail("Could not save"),
  });
  const moderate = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      apiFetch(`/api/circles/${circleId}/forum/held/${id}`, {
        method: "POST",
        body: JSON.stringify({ approve }),
      }),
    onSuccess: (_result, { approve }) => {
      refresh();
      toast({ title: approve ? "Approved and sent" : "Rejected" });
    },
    onError: fail("Could not do that"),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <p className="text-sm text-foreground">{(error as Error)?.message}</p>;

  return (
    <div className="flex flex-col gap-4" data-forum>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm">
        <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 break-all font-medium text-foreground" data-group-address>
          {data.address}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-white"
          onClick={() => {
            void navigator.clipboard?.writeText(data.address);
            toast({ title: "Address copied" });
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
        <span className="basis-full text-xs text-muted">
          {data.emailOn
            ? `Write to this address from any email, or post here: every message goes to ${circleName}'s members${
                data.reach.email ? ` (${plural(data.reach.email, "person")} by email)` : ""
              }. Everyone at CVC can read it here.`
            : "Email is off for this circle: messages stay on this page. Everyone at CVC can read it."}
        </span>
      </div>

      {data.member && data.emailOn ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-light">
          You get messages:
          <SegmentedControl
            label="How you get this circle's messages"
            value={data.myDelivery}
            onChange={(value) => delivery.mutate(value)}
            options={[
              { value: "each", label: "By email" },
              { value: "web", label: "Web only" },
            ]}
          />
        </div>
      ) : null}

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
                {start.isPending ? "Sending…" : data.emailOn ? "Post and email" : "Post"}
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
                The subject is the poll&apos;s question. Members can answer with one click in the
                email.
              </p>
            ) : null}
          </form>
        ) : (
          <Button className="w-fit gap-1.5" onClick={() => setWriting(true)}>
            <MessageSquarePlus className="h-4 w-4" /> Start a conversation
          </Button>
        )
      ) : null}

      {data.canModerate && data.held.length ? (
        <section
          className="flex flex-col gap-2 rounded-lg border border-sun/60 bg-sun/10 p-3"
          aria-label="Waiting for approval"
        >
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ShieldQuestion className="h-4 w-4" aria-hidden /> Waiting for approval (
            {data.held.length})
          </h3>
          {data.held.map((held) => (
            <article key={held.id} className="flex flex-col gap-1 rounded-md bg-white p-2 text-sm">
              <p className="font-medium text-foreground">{held.subject}</p>
              <p className="text-xs text-muted">
                From {held.fromName} ({held.fromEmail}) ·{" "}
                {held.reason === "unverified"
                  ? "couldn't be verified; they were asked to confirm"
                  : held.reason === "not_member"
                    ? "a resident who isn't a member"
                    : "someone outside CVC"}{" "}
                · {timeAgo(held.at)}
              </p>
              <p className="line-clamp-4 whitespace-pre-wrap text-foreground-light">{held.text}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={moderate.isPending}
                  onClick={() => moderate.mutate({ id: held.id, approve: true })}
                >
                  <Check className="h-4 w-4" /> Approve and send
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  disabled={moderate.isPending}
                  onClick={() => moderate.mutate({ id: held.id, approve: false })}
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
              </div>
            </article>
          ))}
        </section>
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
          No conversations yet{data.canPost ? " — start one, or write to the address." : "."}
        </p>
      )}
    </div>
  );
}
