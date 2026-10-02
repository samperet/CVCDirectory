"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumThreadDocument, ForumThreadSummary } from "@/lib/forum/store";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import type { ForumTopic } from "@/lib/forum/topics";

/** A topic, with how many discussions it holds and its most recently active one. */
export type TopicSummary = ForumTopic & {
  threadCount: number;
  lastActivityAt: string | null;
  latest: { id: string; title: string } | null;
};

export function useTopics() {
  return useQuery({
    queryKey: ["forum", "topics"],
    queryFn: () => apiFetch<{ topics: TopicSummary[] }>("/api/forum/topics"),
  });
}

/** Rename a topic or change its description (admins). */
function TopicEditor({ topic, onDone }: { topic: ForumTopic; onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description ?? "");
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/forum/topics/${topic.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum", "topics"] });
      onDone();
    },
    onError: (error: Error) =>
      toast({
        title: "Could not save the topic",
        description: error.message,
        variant: "destructive",
      }),
  });
  return (
    <Card className="flex flex-col gap-3">
      <Input
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        aria-label="Topic name"
        className="bg-white"
      />
      <Textarea
        rows={2}
        value={description}
        maxLength={300}
        placeholder="What belongs here? (optional)"
        onChange={(e) => setDescription(e.target.value)}
        className="bg-white"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending || name.trim().length < 2}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/** One forum topic: its discussions, most recently active first, and starting a new one. */
export function TopicClient({ topicId }: { topicId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const topics = useTopics();
  const topic = topics.data?.topics.find((entry) => entry.id === topicId);
  const [editingTopic, setEditingTopic] = useState(false);
  const removeTopic = useMutation({
    mutationFn: () =>
      apiFetch<{ moved: number }>(`/api/forum/topics/${topicId}`, { method: "DELETE" }),
    onSuccess: ({ moved }) => {
      queryClient.invalidateQueries({ queryKey: ["forum"] });
      toast({
        title: "Topic removed",
        description: moved
          ? `${moved} ${moved === 1 ? "discussion" : "discussions"} moved to General.`
          : undefined,
      });
      router.replace("/forum");
    },
    onError: (error: Error) =>
      toast({
        title: "Could not remove the topic",
        description: error.message,
        variant: "destructive",
      }),
  });
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const ready = title.trim().length >= 3 && !!body.trim();

  const { data, isLoading } = useQuery({
    queryKey: ["forum", "threads", topicId],
    queryFn: () =>
      apiFetch<{ threads: ForumThreadSummary[] }>(
        `/api/forum/threads?${new URLSearchParams({ topic: topicId })}`
      ),
  });
  const threads = data?.threads ?? [];

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ForumThreadDocument>("/api/forum/threads", {
        method: "POST",
        body: JSON.stringify({ topicId, title, body }),
      }),
    onSuccess: (doc) => router.push(`/forum/${doc.thread.id}`),
    onError: (error: Error) =>
      toast({
        title: "Could not start discussion",
        description: error.message,
        variant: "destructive",
      }),
  });

  if (topics.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (!topic) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-foreground">That topic wasn&apos;t found.</p>
        <Link
          href="/forum"
          className="text-sm font-medium text-secondary-foreground underline underline-offset-4"
        >
          All topics
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/forum" label="Forum" />
      {editingTopic ? <TopicEditor topic={topic} onDone={() => setEditingTopic(false)} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className={cn("min-w-0", editingTopic && "hidden")}>
          <h1 className="text-2xl font-semibold text-foreground">{topic.name}</h1>
          {topic.description ? <p className="text-sm text-muted">{topic.description}</p> : null}
          {user?.isAdmin ? (
            <div className="mt-1 flex gap-3 text-xs">
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium text-secondary-foreground hover:underline"
                onClick={() => setEditingTopic(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit topic
              </button>
              {topic.id !== "general" ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium text-muted hover:text-destructive hover:underline"
                  disabled={removeTopic.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove the “${topic.name}” topic? Its discussions move to General.`
                      )
                    )
                      removeTopic.mutate();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove topic
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {user ? (
          <Button
            className="gap-1"
            onClick={() => setComposing((v) => !v)}
            variant={composing ? "outline" : "default"}
          >
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
            placeholder="Title"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
          />
          <Textarea
            rows={5}
            placeholder="What would you like to discuss?"
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !ready}>
              {create.isPending ? "Posting…" : "Post discussion"}
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
              <Link
                href={`/forum/${thread.id}`}
                className="block rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:border-primary"
              >
                <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                  {thread.title}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{thread.authorName}</span>
                  <span>started {timeAgo(thread.createdAt)}</span>
                  {thread.replyCount ? <span>active {timeAgo(thread.lastActivityAt)}</span> : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <p className="text-sm text-muted">
            No discussions in {topic.name} yet. Start the first one!
          </p>
        </Card>
      )}
    </div>
  );
}
