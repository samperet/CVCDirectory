"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MessagesSquare, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumTopic } from "@/lib/forum/topics";
import { timeAgo } from "@/lib/time";
import { useTopics } from "@/components/forum/topic-client";
import { SectionArt } from "@/components/layout/section-art";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

/** Add a forum topic (admins). */
function NewTopicForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () => apiFetch<{ topic: ForumTopic }>("/api/forum/topics", { method: "POST", body: JSON.stringify({ name, description }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum", "topics"] });
      onDone();
    },
    onError: (error: Error) => toast({ title: "Could not add the topic", description: error.message, variant: "destructive" }),
  });
  return (
    <Card className="flex flex-col gap-3">
      <Input placeholder="Topic, e.g. Gardens & grounds" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Topic name" />
      <Textarea rows={2} placeholder="What belongs here? (optional)" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex gap-2">
        <Button onClick={() => create.mutate()} disabled={create.isPending || name.trim().length < 2}>
          {create.isPending ? "Adding…" : "Add topic"}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/** The forum's front page: its topics, each opening that topic's discussions. */
export function ForumIndexClient() {
  const { user } = useSession();
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useTopics();
  const topics = data?.topics ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionArt href="/forum" size={48} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Forum</h1>
          </div>
        </div>
        {user?.isAdmin ? (
          <Button className="gap-1" variant={adding ? "outline" : "default"} onClick={() => setAdding((value) => !value)}>
            {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {adding ? "Cancel" : "New topic"}
          </Button>
        ) : null}
      </div>

      {adding ? <NewTopicForm onDone={() => setAdding(false)} /> : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading topics…</p>
      ) : error ? (
        <Card>
          <p className="text-sm text-foreground">{(error as Error).message}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/forum/topics/${topic.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-soft transition hover:border-primary"
              >
                <MessagesSquare className="hidden h-6 w-6 shrink-0 text-primary sm:block" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-foreground">{topic.name}</p>
                  {topic.description ? <p className="text-sm text-foreground-light">{topic.description}</p> : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>
                      {topic.threadCount} {topic.threadCount === 1 ? "discussion" : "discussions"}
                    </span>
                    {topic.latest && topic.lastActivityAt ? (
                      <span className="min-w-0 truncate">
                        Latest: <span className="font-medium text-foreground-light">{topic.latest.title}</span> · {timeAgo(topic.lastActivityAt)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
