"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { TaskComment } from "@/lib/tasks/shared";
import { liveComments } from "@/lib/comments/shared";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentTree } from "@/components/comments/comment-tree";
import { useToast } from "@/components/ui/use-toast";

type CommentsResponse = { comments: TaskComment[]; canModerate: boolean };

/**
 * A task's conversation. Anyone signed in can comment or reply to any
 * comment, and replies nest under what they answer. Authors edit and delete
 * their own; the circle's editors and admins can delete any.
 */
export function TaskComments({
  circleId,
  number,
  canComment,
}: {
  circleId: string;
  number: number;
  canComment: boolean;
}) {
  const { user } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["task-comments", circleId, number];
  const base = `/api/circles/${circleId}/tasks/${number}/comments`;
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<CommentsResponse>(base),
  });
  const [flash, setFlash] = useState<string | null>(null);
  const comments = data?.comments ?? [];
  const count = liveComments(comments).length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["tasks", circleId] });
  };
  const fail = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: "destructive" });
  const add = useMutation({
    mutationFn: (input: { body: string; parentId: string | null }) =>
      apiFetch<{ comment: TaskComment }>(base, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: ({ comment }) => {
      setFlash(comment.id);
      refresh();
    },
    onError: fail("Could not post the comment"),
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiFetch(`${base}/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
    onSuccess: refresh,
    onError: fail("Could not save the comment"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: fail("Could not delete the comment"),
  });
  const mine = (comment: TaskComment) => !!user && comment.authorId === user.id;

  return (
    <section id="comments" className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <MessageSquare className="h-5 w-5 text-primary" aria-hidden /> Comments{" "}
        {count ? <span className="text-sm font-normal text-muted">({count})</span> : null}
      </h2>
      {canComment ? (
        <CommentForm
          placeholder="Add a comment — questions, updates, what you found"
          submitLabel="Comment"
          busy={add.isPending}
          onSubmit={(body) => add.mutateAsync({ body, parentId: null })}
        />
      ) : null}
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <CommentTree
          comments={comments}
          nesting="any"
          canReply={() => canComment}
          canEdit={mine}
          canDelete={(comment) => mine(comment) || !!data?.canModerate}
          onReply={(parentId, body) => add.mutateAsync({ body, parentId })}
          onEdit={(comment, body) => edit.mutateAsync({ id: comment.id, body })}
          onDelete={(comment) => remove.mutateAsync(comment.id)}
          busy={add.isPending || edit.isPending}
          flashId={flash}
        />
      )}
    </section>
  );
}
