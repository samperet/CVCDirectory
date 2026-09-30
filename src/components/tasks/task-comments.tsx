"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, MessageSquare, Pencil, Reply, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { TaskComment } from "@/lib/tasks/shared";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type CommentsResponse = { comments: TaskComment[]; canModerate: boolean };

// Replies step in this many levels, then carry on at that depth so deep conversations still fit a phone.
const MAX_INDENT = 4;

function CommentForm({
  placeholder,
  initial = "",
  submitLabel,
  autoFocus,
  busy,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  initial?: string;
  submitLabel: string;
  autoFocus?: boolean;
  busy: boolean;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const submit = async () => {
    if (!body.trim() || busy) return;
    try {
      await onSubmit(body.trim());
      setBody("");
    } catch {
      // Kept, so it can be sent again; the error has been shown.
    }
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Textarea
        autoFocus={autoFocus}
        rows={initial || autoFocus ? 3 : 2}
        value={body}
        maxLength={4000}
        placeholder={placeholder}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
          if (event.key === "Escape") onCancel?.();
        }}
        className="bg-white"
        aria-label={placeholder}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!body.trim() || busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * A task's conversation. Anyone signed in can comment or reply to any
 * comment, and replies nest under what they answer; a comment with replies
 * can be folded away. Authors edit and delete their own; the circle's
 * editors and admins can delete any.
 */
export function TaskComments({ circleId, number, canComment }: { circleId: string; number: number; canComment: boolean }) {
  const { user } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["task-comments", circleId, number];
  const base = `/api/circles/${circleId}/tasks/${number}/comments`;
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => apiFetch<CommentsResponse>(base) });
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);

  const children = useMemo(() => {
    const map = new Map<string | null, TaskComment[]>();
    for (const comment of data?.comments ?? []) map.set(comment.parentId, [...(map.get(comment.parentId) ?? []), comment]);
    return map;
  }, [data]);
  const count = (data?.comments ?? []).filter((comment) => !comment.deleted).length;
  const descendants = (id: string): number => (children.get(id) ?? []).reduce((sum, child) => sum + 1 + descendants(child.id), 0);

  // A link to one comment (#comment-<id>) scrolls to it and marks it.
  useEffect(() => {
    if (!data) return;
    const id = window.location.hash.match(/^#comment-(.+)$/)?.[1];
    if (!id) return;
    setFlash(id);
    requestAnimationFrame(() => document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [data]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(timer);
  }, [flash]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["tasks", circleId] });
  };
  const fail = (title: string) => (error: Error) => toast({ title, description: error.message, variant: "destructive" });
  const add = useMutation({
    mutationFn: (input: { body: string; parentId: string | null }) => apiFetch<{ comment: TaskComment }>(base, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: ({ comment }) => {
      setReplyTo(null);
      setFlash(comment.id);
      refresh();
    },
    onError: fail("Could not post the comment"),
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => apiFetch(`${base}/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: fail("Could not save the comment"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: fail("Could not delete the comment"),
  });

  const renderComment = (comment: TaskComment, depth: number): React.ReactNode => {
    const replies = children.get(comment.id) ?? [];
    const isFolded = folded.has(comment.id);
    const mine = !!user && comment.authorId === user.id;
    const toggleFold = () =>
      setFolded((current) => {
        const next = new Set(current);
        if (next.has(comment.id)) next.delete(comment.id);
        else next.add(comment.id);
        return next;
      });
    return (
      <li key={comment.id} className="flex flex-col">
        <div
          id={`comment-${comment.id}`}
          className={cn("scroll-mt-28 rounded-lg px-3 py-2 transition-colors duration-1000", flash === comment.id ? "bg-sun/15" : "bg-transparent")}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
            {comment.deleted ? (
              <span className="italic text-muted">Deleted comment</span>
            ) : (
              <>
                <span className="text-sm font-semibold text-foreground">{comment.authorName}</span>
                <a href={`#comment-${comment.id}`} className="text-muted hover:underline">
                  {timeAgo(comment.createdAt)}
                </a>
                {comment.editedAt ? <span className="text-muted">· edited</span> : null}
              </>
            )}
          </div>
          {editing === comment.id ? (
            <div className="mt-1.5">
              <CommentForm
                placeholder="Edit your comment"
                initial={comment.body}
                submitLabel="Save"
                autoFocus
                busy={edit.isPending}
                onSubmit={(body) => edit.mutateAsync({ id: comment.id, body })}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : comment.deleted ? null : (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{comment.body}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
            {replies.length ? (
              <button type="button" onClick={toggleFold} className="inline-flex items-center gap-0.5 hover:text-foreground" aria-expanded={!isFolded}>
                {isFolded ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {isFolded ? `Show ${descendants(comment.id)} ${descendants(comment.id) === 1 ? "reply" : "replies"}` : "Hide replies"}
              </button>
            ) : null}
            {canComment && !comment.deleted ? (
              <button type="button" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)} className="inline-flex items-center gap-1 hover:text-foreground">
                <Reply className="h-3.5 w-3.5" /> Reply
              </button>
            ) : null}
            {mine && !comment.deleted && editing !== comment.id ? (
              <button type="button" onClick={() => setEditing(comment.id)} className="inline-flex items-center gap-1 hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            ) : null}
            {(mine || data?.canModerate) && !comment.deleted ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this comment?")) remove.mutate(comment.id);
                }}
                className="inline-flex items-center gap-1 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            ) : null}
          </div>
          {replyTo === comment.id ? (
            <div className="mt-2">
              <CommentForm
                placeholder={`Reply to ${comment.authorName}`}
                submitLabel="Reply"
                autoFocus
                busy={add.isPending}
                onSubmit={(body) => add.mutateAsync({ body, parentId: comment.id })}
                onCancel={() => setReplyTo(null)}
              />
            </div>
          ) : null}
        </div>
        {replies.length && !isFolded ? (
          <ul className={cn("flex flex-col gap-1", depth < MAX_INDENT && "ml-3 border-l-2 border-border pl-2 sm:ml-4 sm:pl-3")}>
            {replies.map((reply) => renderComment(reply, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <section id="comments" className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <MessageSquare className="h-5 w-5 text-primary" aria-hidden /> Comments {count ? <span className="text-sm font-normal text-muted">({count})</span> : null}
      </h2>
      {canComment ? (
        <CommentForm placeholder="Add a comment — questions, updates, what you found" submitLabel="Comment" busy={add.isPending && !replyTo} onSubmit={(body) => add.mutateAsync({ body, parentId: null })} />
      ) : null}
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (children.get(null) ?? []).length ? (
        <ul className="flex flex-col gap-1">{(children.get(null) ?? []).map((comment) => renderComment(comment, 0))}</ul>
      ) : (
        <p className="text-sm text-muted">No comments yet.</p>
      )}
    </section>
  );
}
