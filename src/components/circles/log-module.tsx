"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { LogEntry } from "@/lib/log/store";
import { CommentTree } from "@/components/comments/comment-tree";
import { CommentForm } from "@/components/comments/comment-form";
import { useToast } from "@/components/ui/use-toast";
import { Loading } from "@/components/ui/status";

const PAGE = 10;

/** A circle's log, from the API. */
export const logQuery = (circleId: string) => ({
  queryKey: ["log", circleId],
  queryFn: () =>
    apiFetch<{ entries: LogEntry[]; canPost: boolean; canReply: boolean; canModerate: boolean }>(
      `/api/circles/${circleId}/log`
    ),
});

/**
 * A circle's Log module: short updates, newest first, each with its replies
 * — like a small forum, but nobody is notified or emailed (that's what the
 * Forum is for). Who can post is the module's setting; anyone signed in can
 * reply. Ten at a time, with **Show older updates**.
 */
export function LogModule({ circleId }: { circleId: string }) {
  const { toast } = useToast();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery(logQuery(circleId));
  const [shown, setShown] = useState(PAGE);
  const base = `/api/circles/${circleId}/log`;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["log", circleId] });
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const post = useMutation({
    mutationFn: (input: { body: string; parentId?: string }) =>
      apiFetch(base, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: refresh,
    onError: fail("Could not post"),
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiFetch(`${base}/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
    onSuccess: refresh,
    onError: fail("Could not save"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: fail("Could not delete"),
  });

  const entries = useMemo(() => data?.entries ?? [], [data]);
  // Updates newest first; their replies under them, oldest first.
  const updates = useMemo(
    () =>
      entries
        .filter((entry) => !entry.parentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries]
  );
  if (isLoading) return <Loading />;
  if (error || !data) return <p className="text-sm text-foreground">{(error as Error)?.message}</p>;
  const mine = (entry: LogEntry) => user?.id === entry.authorId;

  return (
    <div className="flex flex-col gap-3" data-log>
      {data.canPost ? (
        <CommentForm
          placeholder="Share a short update…"
          submitLabel="Post"
          rows={2}
          maxLength={2000}
          busy={post.isPending}
          onSubmit={(body) => post.mutateAsync({ body })}
        />
      ) : null}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <BellOff className="h-3.5 w-3.5" aria-hidden /> Updates here don&apos;t notify or email
        anyone.
      </p>
      {updates.length ? (
        <>
          <CommentTree
            comments={entries}
            roots={updates.slice(0, shown)}
            nesting="one"
            idPrefix="log"
            className="-mx-3"
            canReply={() => data.canReply}
            canEdit={mine}
            canDelete={(entry) => mine(entry) || data.canModerate}
            onReply={(parentId, body) => post.mutateAsync({ body, parentId })}
            onEdit={(entry, body) => edit.mutateAsync({ id: entry.id, body })}
            onDelete={(entry) => remove.mutateAsync(entry.id)}
            busy={post.isPending || edit.isPending}
            maxLength={2000}
            deleteConfirm={(entry) =>
              entry.parentId ? { title: "Delete this reply?" } : { title: "Delete this update?" }
            }
          />
          {updates.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE)}
              className="w-fit text-sm font-medium text-secondary-foreground hover:underline"
            >
              Show older updates ({updates.length - shown})
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">
          {data.canPost ? "No updates yet — post the first." : "No updates yet."}
        </p>
      )}
    </div>
  );
}
