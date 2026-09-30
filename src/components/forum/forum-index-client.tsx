"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, MessageSquare, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumThreadDocument, ForumThreadSummary } from "@/lib/forum/store";
import { MAX_POLL_OPTIONS } from "@/lib/forum/poll";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { SectionArt } from "@/components/layout/section-art";

export function ForumIndexClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // An optional poll: the title is its question.
  const [polling, setPolling] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [closesOn, setClosesOn] = useState("");
  const filled = options.map((option) => option.trim()).filter(Boolean);
  const ready = title.trim().length >= 3 && (polling ? filled.length >= 2 : !!body.trim());

  const { data, isLoading } = useQuery({
    queryKey: ["forum", "threads"],
    queryFn: () => apiFetch<{ threads: ForumThreadSummary[] }>("/api/forum/threads"),
  });
  const threads = data?.threads ?? [];

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ForumThreadDocument>("/api/forum/threads", {
        method: "POST",
        body: JSON.stringify({
          title,
          body,
          poll: polling
            ? {
                options: filled,
                multiple,
                // The end of the chosen day, where the author is.
                closesAt: closesOn ? new Date(`${closesOn}T23:59:59`).toISOString() : null,
              }
            : undefined,
        }),
      }),
    onSuccess: (doc) => router.push(`/forum/${doc.thread.id}`),
    onError: (error: Error) =>
      toast({ title: "Could not start discussion", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionArt href="/forum" size={48} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Forum</h1>
            <p className="text-sm text-muted">Neighborhood discussions. Reply to any post to start a thread.</p>
          </div>
        </div>
        {user ? (
          <Button className="gap-1" onClick={() => setComposing((v) => !v)} variant={composing ? "outline" : "default"}>
            {composing ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {composing ? "Cancel" : "Start a discussion"}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/login">Sign in to post</Link>
          </Button>
        )}
      </div>

      {composing && user ? (
        <Card className="flex flex-col gap-3">
          <Input
            placeholder={polling ? "Question, e.g. Which Saturday works for the work day?" : "Title"}
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={polling ? "Question" : "Title"}
          />
          <Textarea
            rows={polling ? 3 : 5}
            placeholder={polling ? "Add some context (optional)" : "What would you like to discuss?"}
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
          />
          {polling ? (
            <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3">
              <legend className="px-1 text-sm font-semibold text-foreground">Poll options</legend>
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={option}
                    maxLength={120}
                    placeholder={`Option ${index + 1}`}
                    onChange={(e) => setOptions((current) => current.map((entry, i) => (i === index ? e.target.value : entry)))}
                    className="bg-white"
                    aria-label={`Option ${index + 1}`}
                  />
                  {options.length > 2 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted"
                      onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Remove option ${index + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
              {options.length < MAX_POLL_OPTIONS ? (
                <Button type="button" variant="outline" size="sm" className="w-fit gap-1" onClick={() => setOptions((current) => [...current, ""])}>
                  <Plus className="h-4 w-4" /> Add option
                </Button>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm text-foreground">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="h-4 w-4 accent-primary" />
                  Allow more than one choice
                </label>
                <label className="flex items-center gap-2">
                  Closes on
                  <Input
                    type="date"
                    value={closesOn}
                    min={new Date().toLocaleDateString("en-CA")}
                    onChange={(e) => setClosesOn(e.target.value)}
                    className="h-9 w-auto bg-white"
                  />
                  <span className="text-xs text-muted">(optional)</span>
                </label>
              </div>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !ready}>
              {create.isPending ? "Posting…" : polling ? "Post poll" : "Post discussion"}
            </Button>
            <Button type="button" variant="outline" className="gap-1" onClick={() => setPolling((value) => !value)}>
              {polling ? (
                <>
                  <X className="h-4 w-4" /> Remove poll
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4" /> Add a poll
                </>
              )}
            </Button>
            <span className="text-xs text-muted">Posting as {user.name}.</span>
          </div>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading discussions…</p>
      ) : threads.length ? (
        <ul className="flex flex-col gap-3">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link href={`/forum/${thread.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:border-primary">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                  {thread.poll ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      <BarChart3 className="h-3.5 w-3.5" /> Poll
                    </span>
                  ) : null}
                  {thread.title}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{thread.authorName}</span>
                  <span>started {timeAgo(thread.createdAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
                  </span>
                  {thread.replyCount ? <span>last activity {timeAgo(thread.lastActivityAt)}</span> : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <p className="text-sm text-muted">No discussions yet. Start the first one!</p>
        </Card>
      )}
    </div>
  );
}
