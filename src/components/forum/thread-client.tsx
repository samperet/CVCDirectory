"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumReply, ForumThreadDocument } from "@/lib/forum/store";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/** Past this depth replies stop indenting further, so long chains stay readable on phones. */
const MAX_INDENT_DEPTH = 5;

function Author({ name }: { name: string }) {
  return <span className="font-medium text-foreground">{name}</span>;
}

function ReplyForm({
  threadId,
  parentId,
  onDone,
  autoFocus,
}: {
  threadId: string;
  parentId: string | null;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [body, setBody] = useState("");

  const reply = useMutation({
    mutationFn: () =>
      apiFetch<ForumThreadDocument>(`/api/forum/threads/${threadId}/replies`, {
        method: "POST",
        body: JSON.stringify({ parentId, body }),
      }),
    onSuccess: (doc) => {
      queryClient.setQueryData(["forum", "thread", threadId], doc);
      queryClient.invalidateQueries({ queryKey: ["forum", "threads"] });
      setBody("");
      onDone?.();
    },
    onError: (error: Error) =>
      toast({ title: "Could not post reply", description: error.message, variant: "destructive" }),
  });

  if (!user) {
    return (
      <p className="text-sm text-muted">
        <Link href="/login" className="font-medium text-secondary-foreground underline underline-offset-4">
          Sign in
        </Link>{" "}
        to reply.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim()) reply.mutate();
      }}
    >
      <Textarea
        rows={parentId ? 2 : 3}
        placeholder={parentId ? "Write a reply…" : "Add to the discussion…"}
        value={body}
        maxLength={3000}
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        className="bg-white"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={reply.isPending || !body.trim()}>
          {reply.isPending ? "Posting…" : "Post reply"}
        </Button>
        {onDone ? (
          <Button type="button" size="sm" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ReplyNode({
  reply,
  childrenOf,
  depth,
  threadId,
  parentName,
}: {
  reply: ForumReply;
  childrenOf: Map<string | null, ForumReply[]>;
  depth: number;
  threadId: string;
  parentName: string | null;
}) {
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const children = childrenOf.get(reply.id) ?? [];
  const indent = depth > 0 && depth <= MAX_INDENT_DEPTH;
  const beyondIndent = depth > MAX_INDENT_DEPTH;

  return (
    <li className={cn(indent && "ml-3 border-l-2 border-border pl-3 md:ml-5 md:pl-4")}>
      <div className="flex flex-col gap-1 py-2">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <Author name={reply.authorName} />
          <time dateTime={reply.createdAt}>{timeAgo(reply.createdAt)}</time>
          {beyondIndent && parentName ? (
            <span className="inline-flex items-center gap-1">
              <CornerDownRight className="h-3 w-3" /> replying to {parentName}
            </span>
          ) : null}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{reply.body}</p>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" className="font-medium text-secondary-foreground hover:underline" onClick={() => setReplying((v) => !v)}>
            Reply
          </button>
          {children.length ? (
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-muted hover:text-foreground"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {collapsed ? `Show ${children.length} ${children.length === 1 ? "reply" : "replies"}` : "Hide replies"}
            </button>
          ) : null}
        </div>
        {replying ? (
          <div className="mt-1">
            <ReplyForm threadId={threadId} parentId={reply.id} autoFocus onDone={() => setReplying(false)} />
          </div>
        ) : null}
      </div>
      {children.length && !collapsed ? (
        <ul>
          {children.map((child) => (
            <ReplyNode
              key={child.id}
              reply={child}
              childrenOf={childrenOf}
              depth={depth + 1}
              threadId={threadId}
              parentName={reply.authorName}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ThreadClient({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["forum", "thread", id],
    queryFn: () => apiFetch<ForumThreadDocument>(`/api/forum/threads/${id}`),
  });

  // Group the flat reply list by parent; each level reads oldest-first.
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, ForumReply[]>();
    for (const reply of data?.replies ?? []) {
      const list = map.get(reply.parentId) ?? [];
      list.push(reply);
      map.set(reply.parentId, list);
    }
    map.forEach((list) => list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    return map;
  }, [data?.replies]);

  if (isLoading) return <p className="text-sm text-muted">Loading discussion…</p>;
  if (error || !data) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-foreground">This discussion could not be found.</p>
        <Link href="/forum" className="text-sm font-medium text-secondary-foreground underline underline-offset-4">
          Back to the forum
        </Link>
      </Card>
    );
  }

  const { thread, replies } = data;
  const topLevel = childrenOf.get(null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/forum" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All discussions
      </Link>

      <Card className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{thread.title}</h1>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <Author name={thread.authorName} />
          <time dateTime={thread.createdAt}>{timeAgo(thread.createdAt)}</time>
        </p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{thread.body}</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </h2>
        <ReplyForm threadId={thread.id} parentId={null} />
        {topLevel.length ? (
          <ul className="divide-y divide-border">
            {topLevel.map((reply) => (
              <ReplyNode
                key={reply.id}
                reply={reply}
                childrenOf={childrenOf}
                depth={0}
                threadId={thread.id}
                parentName={null}
              />
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
