"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageSquare, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession, useVerifiedIds } from "@/lib/auth/client";
import type { ForumThreadDocument, ForumThreadSummary } from "@/lib/forum/store";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { VerifiedBadge } from "@/components/auth/verified-badge";

export function ForumIndexClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();
  const verifiedIds = useVerifiedIds();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["forum", "threads"],
    queryFn: () => apiFetch<{ threads: ForumThreadSummary[] }>("/api/forum/threads"),
  });
  const threads = data?.threads ?? [];

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ForumThreadDocument>("/api/forum/threads", {
        method: "POST",
        body: JSON.stringify({ title, body }),
      }),
    onSuccess: (doc) => router.push(`/forum/${doc.thread.id}`),
    onError: (error: Error) =>
      toast({ title: "Could not start discussion", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Forum</h1>
          <p className="text-sm text-muted">Neighborhood discussions. Reply to any post to start a thread.</p>
        </div>
        {user ? (
          <Button className="gap-1" onClick={() => setComposing((v) => !v)} variant={composing ? "outline" : "default"}>
            <Plus className="h-4 w-4" />
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
          <Input placeholder="Title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          <Textarea rows={5} placeholder="What would you like to discuss?" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || title.trim().length < 3 || !body.trim()}
            >
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
              <Link href={`/forum/${thread.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:border-primary">
                <p className="font-semibold text-foreground">{thread.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    {thread.authorName}
                    {verifiedIds.has(thread.authorId) ? <VerifiedBadge className="[&>svg]:h-3.5 [&>svg]:w-3.5" /> : null}
                  </span>
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
