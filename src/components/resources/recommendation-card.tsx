"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Recommendation, ResourceComment, ResourceLike } from "@/lib/resources/store";
import { Avatar } from "@/components/profile/avatar";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentTree } from "@/components/comments/comment-tree";
import { ErrorCard, Loading } from "@/components/ui/status";
import { KEY, ListResponse, useReplace } from "@/components/resources/resources-data";
import { RecommendationForm } from "@/components/resources/recommendation-form";
import { Linkified } from "@/components/resources/linkified";
import { likedByLabel } from "@/lib/text";

/** One recommendation: who made it, likes, comments, and editing or removing it (its author or an admin). */

function LikeButton({ item }: { item: Recommendation }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const replace = useReplace();
  const { user } = useSession();
  const liked = !!user && item.likes.some((like) => like.userId === user.id);

  const toggle = useMutation({
    mutationFn: (like: boolean) =>
      apiFetch<{ recommendation: Recommendation }>(`/api/resources/${item.id}/like`, {
        method: like ? "PUT" : "DELETE",
      }),
    onMutate: async (like: boolean) => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<ListResponse>(KEY);
      const others = item.likes.filter((entry) => entry.userId !== user.id);
      replace(item.id, {
        ...item,
        likes: like ? [...others, { userId: user.id, name: user.name }] : others,
      });
      return { previous };
    },
    onError: (err: Error, _like, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
      toast({
        title: "Could not save your like",
        description: err.message,
        variant: "destructive",
      });
    },
    onSuccess: ({ recommendation }) => replace(item.id, recommendation),
  });

  return (
    <button
      type="button"
      onClick={() => toggle.mutate(!liked)}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      title={item.likes.length ? likedByLabel(item.likes, user?.id ?? null) : "Like"}
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium transition",
        liked ? "text-rose-600 hover:text-rose-700" : "text-muted hover:text-rose-600"
      )}
    >
      <Heart className={cn("h-4 w-4", liked && "fill-current")} />
      {item.likes.length ? (
        <span className="tabular-nums">{item.likes.length}</span>
      ) : (
        <span>Like</span>
      )}
    </button>
  );
}

/** A recommendation's comments (flat): anyone signed in adds one; authors and admins edit and delete. */
function Comments({ item }: { item: Recommendation }) {
  const { toast } = useToast();
  const replace = useReplace();
  const { user } = useSession();
  const url = (commentId?: string) =>
    `/api/resources/${item.id}/comments${commentId ? `/${commentId}` : ""}`;
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const done = ({ recommendation }: { recommendation: Recommendation }) =>
    replace(item.id, recommendation);
  const post = useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ recommendation: Recommendation }>(url(), {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: done,
    onError: fail("Could not post comment"),
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiFetch<{ recommendation: Recommendation }>(url(id), {
        method: "PATCH",
        body: JSON.stringify({ body }),
      }),
    onSuccess: done,
    onError: fail("Could not update comment"),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ recommendation: Recommendation }>(url(id), { method: "DELETE" }),
    onSuccess: done,
    onError: fail("Could not delete comment"),
  });
  const canChange = (comment: ResourceComment) =>
    !!user && (user.isAdmin || comment.authorId === user.id);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <CommentTree
        comments={item.comments}
        nesting="none"
        canEdit={canChange}
        canDelete={canChange}
        onEdit={(comment, body) => edit.mutateAsync({ id: comment.id, body })}
        onDelete={(comment) => remove.mutateAsync(comment.id)}
        busy={edit.isPending}
        maxLength={2000}
        renderBody={(comment) => (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
            <Linkified text={comment.body} />
          </p>
        )}
        emptyLabel={
          <p className="text-xs text-muted">No comments yet. Used them too? Share how it went.</p>
        }
      />
      <CommentForm
        placeholder="Add a comment…"
        submitLabel="Post comment"
        maxLength={2000}
        busy={post.isPending}
        onSubmit={(body) => post.mutateAsync(body)}
      />
    </div>
  );
}

export function RecommendationCard({
  item,
  photoFor,
  categories,
}: {
  item: Recommendation;
  photoFor: (personId: string | null) => string | null;
  categories: string[];
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const replace = useReplace();
  const { user } = useSession();
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const canChange =
    !!user && (user.isAdmin || (!!user.personId && item.submittedBy.personId === user.personId));

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/resources/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      replace(item.id, null);
      toast({ title: "Recommendation removed" });
    },
    onError: (err: Error) =>
      toast({ title: "Could not remove", description: err.message, variant: "destructive" }),
  });

  if (editing) {
    return (
      <Card className="p-5">
        <RecommendationForm
          initial={item}
          categories={categories}
          onDone={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h3 className="font-semibold text-foreground">{item.title}</h3>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground-light">
          <Linkified text={item.body} />
        </p>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Avatar
            name={item.submittedBy.name}
            photoUrl={photoFor(item.submittedBy.personId)}
            size={20}
          />
          Recommended by{" "}
          <span className="font-medium text-foreground">{item.submittedBy.name}</span>
        </span>
        {canChange ? (
          <span className="flex gap-3">
            <button
              type="button"
              className="font-medium text-secondary-foreground hover:underline"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="font-medium hover:text-destructive hover:underline"
              onClick={async () => {
                if (
                  await confirm({
                    title: `Remove your recommendation of ${item.title}?`,
                    confirmLabel: "Remove",
                    destructive: true,
                  })
                )
                  remove.mutate();
              }}
            >
              Remove
            </button>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-4 border-t border-border pt-3">
        <LikeButton item={item} />
        <button
          type="button"
          onClick={() => setShowComments((value) => !value)}
          aria-expanded={showComments}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          {item.comments.length
            ? `${item.comments.length} comment${item.comments.length === 1 ? "" : "s"}`
            : "Comment"}
        </button>
      </div>
      {showComments ? <Comments item={item} /> : null}
    </Card>
  );
}
