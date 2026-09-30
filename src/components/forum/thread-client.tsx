"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, CornerDownRight, Heart } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumLike, ForumReply, ForumThreadDocument } from "@/lib/forum/store";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/** Past this depth replies stop indenting further, so long chains stay readable on phones. */
const MAX_INDENT_DEPTH = 5;

/** Mutations that return the updated thread write it straight into the cache. */
function useThreadMutation<T>(threadId: string, request: (input: T) => Promise<ForumThreadDocument>, errorTitle: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (doc) => {
      queryClient.setQueryData(["forum", "thread", threadId], doc);
      queryClient.invalidateQueries({ queryKey: ["forum", "threads"] });
    },
    onError: (error: Error) => toast({ title: errorTitle, description: error.message, variant: "destructive" }),
  });
}

function Byline({ name, createdAt, editedAt }: { name: string; createdAt: string; editedAt?: string | null }) {
  return (
    <>
      <span className="font-medium text-foreground">{name}</span>
      <time dateTime={createdAt}>{timeAgo(createdAt)}</time>
      {editedAt ? <span title={`Edited ${new Date(editedAt).toLocaleString()}`}>(edited)</span> : null}
    </>
  );
}

function ActionLink({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("font-medium hover:underline", danger ? "text-muted hover:text-destructive" : "text-secondary-foreground")}
    >
      {children}
    </button>
  );
}

/** "Sam Peret, Alex Kim and 3 others" — who liked a post, for the like button's tooltip. */
function likedByLabel(likes: ForumLike[], currentUserId: string | null) {
  const names = likes.map((like) => (like.userId === currentUserId ? "You" : like.name));
  names.sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : 0));
  if (names.length <= 3) return `Liked by ${names.join(", ").replace(/, ([^,]*)$/, " and $1")}`;
  return `Liked by ${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/**
 * Like or unlike a post (the opening post when `replyId` is null). The heart
 * fills straight away; if saving fails, the thread is put back as it was.
 */
function LikeButton({ threadId, replyId, likes = [] }: { threadId: string; replyId: string | null; likes?: ForumLike[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const key = ["forum", "thread", threadId];
  const liked = !!user && likes.some((like) => like.userId === user.id);
  const url = replyId ? `/api/forum/threads/${threadId}/replies/${replyId}/like` : `/api/forum/threads/${threadId}/like`;

  const toggle = useMutation({
    mutationFn: (like: boolean) => apiFetch<ForumThreadDocument>(url, { method: like ? "PUT" : "DELETE" }),
    onMutate: async (like: boolean) => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ForumThreadDocument>(key);
      const update = (current: ForumLike[] | undefined) => {
        const others = (current ?? []).filter((entry) => entry.userId !== user.id);
        return like ? [...others, { userId: user.id, name: user.name }] : others;
      };
      if (previous) {
        queryClient.setQueryData<ForumThreadDocument>(key, {
          ...previous,
          thread: replyId ? previous.thread : { ...previous.thread, likes: update(previous.thread.likes) },
          replies: replyId
            ? previous.replies.map((entry) => (entry.id === replyId ? { ...entry, likes: update(entry.likes) } : entry))
            : previous.replies,
        });
      }
      return { previous };
    },
    onError: (error: Error, _like, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast({ title: "Could not save your like", description: error.message, variant: "destructive" });
    },
    onSuccess: (doc) => queryClient.setQueryData(key, doc),
  });

  return (
    <button
      type="button"
      onClick={() => toggle.mutate(!liked)}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      title={likes.length ? likedByLabel(likes, user?.id ?? null) : "Like"}
      className={cn(
        "inline-flex items-center gap-1 font-medium transition",
        liked ? "text-rose-600 hover:text-rose-700" : "text-muted hover:text-rose-600"
      )}
    >
      <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} />
      {likes.length ? <span className="tabular-nums">{likes.length}</span> : <span>Like</span>}
    </button>
  );
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
  const [body, setBody] = useState("");
  const reply = useThreadMutation(
    threadId,
    () =>
      apiFetch<ForumThreadDocument>(`/api/forum/threads/${threadId}/replies`, {
        method: "POST",
        body: JSON.stringify({ parentId, body }),
      }),
    "Could not post reply"
  );

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim())
          reply.mutate(undefined, {
            onSuccess: () => {
              setBody("");
              onDone?.();
            },
          });
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

function EditReplyForm({ threadId, reply, onDone }: { threadId: string; reply: ForumReply; onDone: () => void }) {
  const [body, setBody] = useState(reply.body);
  const save = useThreadMutation(
    threadId,
    () =>
      apiFetch<ForumThreadDocument>(`/api/forum/threads/${threadId}/replies/${reply.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      }),
    "Could not save changes"
  );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim()) save.mutate(undefined, { onSuccess: onDone });
      }}
    >
      <Textarea rows={3} value={body} maxLength={3000} autoFocus onChange={(event) => setBody(event.target.value)} className="bg-white" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || !body.trim() || body.trim() === reply.body}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
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
  currentUserId,
}: {
  reply: ForumReply;
  childrenOf: Map<string | null, ForumReply[]>;
  depth: number;
  threadId: string;
  parentName: string | null;
  currentUserId: string | null;
}) {
  const [mode, setMode] = useState<"view" | "reply" | "edit">("view");
  const [collapsed, setCollapsed] = useState(false);
  const children = childrenOf.get(reply.id) ?? [];
  const indent = depth > 0 && depth <= MAX_INDENT_DEPTH;
  const beyondIndent = depth > MAX_INDENT_DEPTH;
  const { user } = useSession();
  // Authors manage their own comments; admins can moderate any.
  const mine = (currentUserId !== null && reply.authorId === currentUserId) || !!user?.isAdmin;

  const remove = useThreadMutation(
    threadId,
    () => apiFetch<ForumThreadDocument>(`/api/forum/threads/${threadId}/replies/${reply.id}`, { method: "DELETE" }),
    "Could not delete comment"
  );

  return (
    <li className={cn(indent && "ml-3 border-l-2 border-border pl-3 md:ml-5 md:pl-4")}>
      <div id={`reply-${reply.id}`} className="flex scroll-mt-24 flex-col gap-1 rounded-lg py-2 transition-colors duration-1000">
        {reply.deletedAt ? (
          <p className="text-sm italic text-muted">This comment was deleted.</p>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <Byline name={reply.authorName} createdAt={reply.createdAt} editedAt={reply.editedAt} />
              {beyondIndent && parentName ? (
                <span className="inline-flex items-center gap-1">
                  <CornerDownRight className="h-3 w-3" /> replying to {parentName}
                </span>
              ) : null}
            </p>
            {mode === "edit" ? (
              <EditReplyForm threadId={threadId} reply={reply} onDone={() => setMode("view")} />
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{reply.body}</p>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {!reply.deletedAt && mode !== "edit" ? (
            <>
              <LikeButton threadId={threadId} replyId={reply.id} likes={reply.likes} />
              <ActionLink onClick={() => setMode(mode === "reply" ? "view" : "reply")}>Reply</ActionLink>
            </>
          ) : null}
          {mine && !reply.deletedAt && mode === "view" ? (
            <>
              <ActionLink onClick={() => setMode("edit")}>Edit</ActionLink>
              <ActionLink
                danger
                onClick={() => {
                  if (window.confirm("Delete this comment?")) remove.mutate(undefined);
                }}
              >
                {remove.isPending ? "Deleting…" : "Delete"}
              </ActionLink>
            </>
          ) : null}
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
        {mode === "reply" ? (
          <div className="mt-1">
            <ReplyForm threadId={threadId} parentId={reply.id} autoFocus onDone={() => setMode("view")} />
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
              parentName={reply.deletedAt ? null : reply.authorName}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function OpeningPost({ doc, currentUserId }: { doc: ForumThreadDocument; currentUserId: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { thread } = doc;
  const { user } = useSession();
  const author = currentUserId !== null && thread.authorId === currentUserId;
  const mine = author || !!user?.isAdmin;
  const othersReplied = doc.replies.some((reply) => !reply.deletedAt && reply.authorId !== currentUserId);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);
  const [body, setBody] = useState(thread.body);

  const save = useThreadMutation(
    thread.id,
    () =>
      apiFetch<ForumThreadDocument>(`/api/forum/threads/${thread.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, body }),
      }),
    "Could not save changes"
  );
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/forum/threads/${thread.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum", "threads"] });
      toast({ title: "Discussion deleted" });
      router.replace("/forum");
    },
    onError: (error: Error) => toast({ title: "Could not delete discussion", description: error.message, variant: "destructive" }),
  });

  if (editing) {
    return (
      <Card className="flex flex-col gap-3">
        <Input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} className="bg-white text-lg font-semibold" aria-label="Title" />
        <Textarea rows={6} value={body} maxLength={5000} onChange={(event) => setBody(event.target.value)} className="bg-white" aria-label="Post" />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={save.isPending || title.trim().length < 3 || !body.trim()}
            onClick={() => save.mutate(undefined, { onSuccess: () => setEditing(false) })}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTitle(thread.title);
              setBody(thread.body);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold text-foreground">{thread.title}</h1>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <Byline name={thread.authorName} createdAt={thread.createdAt} editedAt={thread.editedAt} />
      </p>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{thread.body}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <LikeButton threadId={thread.id} replyId={null} likes={thread.likes} />
        {mine ? (
          <>
            <ActionLink onClick={() => setEditing(true)}>Edit</ActionLink>
            <ActionLink
              danger
              onClick={() => {
                const warning =
                  !author || othersReplied
                    ? "Delete this discussion and all of its replies? This can't be undone."
                    : "Delete this discussion?";
                if (window.confirm(warning)) remove.mutate();
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete discussion"}
            </ActionLink>
          </>
        ) : null}
      </div>
    </Card>
  );
}

export function ThreadClient({ id }: { id: string }) {
  const { user } = useSession();
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

  // Arriving from a search result (#reply-<id>): bring that reply into view and highlight it briefly.
  const loaded = !!data;
  useEffect(() => {
    if (!loaded || !window.location.hash.startsWith("#reply-")) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("bg-accent");
    const timer = setTimeout(() => target.classList.remove("bg-accent"), 2500);
    return () => clearTimeout(timer);
  }, [loaded]);

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

  const topLevel = childrenOf.get(null) ?? [];
  const count = data.replies.filter((reply) => !reply.deletedAt).length;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/forum" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All discussions
      </Link>

      <OpeningPost key={`${data.thread.editedAt ?? ""}`} doc={data} currentUserId={user?.id ?? null} />

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {count} {count === 1 ? "reply" : "replies"}
        </h2>
        {topLevel.length ? (
          <ul className="divide-y divide-border">
            {topLevel.map((reply) => (
              <ReplyNode
                key={reply.id}
                reply={reply}
                childrenOf={childrenOf}
                depth={0}
                threadId={data.thread.id}
                parentName={null}
                currentUserId={user?.id ?? null}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No replies yet. Start the conversation below.</p>
        )}
        <div className="border-t border-border pt-4">
          <ReplyForm threadId={data.thread.id} parentId={null} />
        </div>
      </Card>
    </div>
  );
}
