"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumLike, ForumReply, ForumThreadDocument } from "@/lib/forum/store";
import { timeAgo } from "@/lib/time";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { likedByLabel } from "@/lib/text";

/** Pieces the opening post and the replies share: the thread's mutations, bylines, and likes. */

/** Mutations that return the updated thread write it straight into the cache. */
export function useThreadMutation<T>(
  threadId: string,
  request: (input: T) => Promise<ForumThreadDocument>,
  errorTitle: string
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (doc) => {
      queryClient.setQueryData(["forum", "thread", threadId], doc);
      queryClient.invalidateQueries({ queryKey: ["forum", "threads"] });
      queryClient.invalidateQueries({ queryKey: ["forum", "topics"] });
    },
    onError: (error: Error) =>
      toast({ title: errorTitle, description: error.message, variant: "destructive" }),
  });
}

export function Byline({
  name,
  createdAt,
  editedAt,
}: {
  name?: string;
  createdAt: string;
  editedAt?: string | null;
}) {
  return (
    <>
      {name ? <span className="font-medium text-foreground">{name}</span> : null}
      <time dateTime={createdAt}>{timeAgo(createdAt)}</time>
      {editedAt ? (
        <span title={`Edited ${new Date(editedAt).toLocaleString()}`}>(edited)</span>
      ) : null}
    </>
  );
}

/**
 * Like or unlike a post (the opening post when `replyId` is null). The heart
 * fills straight away; if saving fails, the thread is put back as it was.
 */
export function LikeButton({
  threadId,
  replyId,
  likes = [],
}: {
  threadId: string;
  replyId: string | null;
  likes?: ForumLike[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const key = ["forum", "thread", threadId];
  const liked = !!user && likes.some((like) => like.userId === user.id);
  const url = replyId
    ? `/api/forum/threads/${threadId}/replies/${replyId}/like`
    : `/api/forum/threads/${threadId}/like`;

  const toggle = useMutation({
    mutationFn: (like: boolean) =>
      apiFetch<ForumThreadDocument>(url, { method: like ? "PUT" : "DELETE" }),
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
          thread: replyId
            ? previous.thread
            : { ...previous.thread, likes: update(previous.thread.likes) },
          replies: replyId
            ? previous.replies.map((entry) =>
                entry.id === replyId ? { ...entry, likes: update(entry.likes) } : entry
              )
            : previous.replies,
        });
      }
      return { previous };
    },
    onError: (error: Error, _like, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast({
        title: "Could not save your like",
        description: error.message,
        variant: "destructive",
      });
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
