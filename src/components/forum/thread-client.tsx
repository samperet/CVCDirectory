"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import { Heart } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumLike, ForumReply, ForumThreadDocument } from "@/lib/forum/store";
import { useTopics } from "@/components/forum/topic-client";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ON_HOVER } from "@/components/ui/hover";
import { useConfirm } from "@/components/ui/confirm";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentTree } from "@/components/comments/comment-tree";
import { Loading } from "@/components/ui/status";
import { Select } from "@/components/ui/select";
import { NotFoundCard } from "@/components/ui/status";

/** Mutations that return the updated thread write it straight into the cache. */
function useThreadMutation<T>(
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

function Byline({
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

function ActionLink({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "font-medium hover:underline",
        danger ? "text-muted hover:text-destructive" : "text-secondary-foreground"
      )}
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
function LikeButton({
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

function OpeningPost({
  doc,
  currentUserId,
}: {
  doc: ForumThreadDocument;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { thread } = doc;
  const { user } = useSession();
  const author = currentUserId !== null && thread.authorId === currentUserId;
  const mine = author || !!user?.isAdmin;
  const othersReplied = doc.replies.some(
    (reply) => !reply.deletedAt && reply.authorId !== currentUserId
  );
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);
  const [body, setBody] = useState(thread.body);
  const topics = useTopics().data?.topics ?? [];
  // A discussion whose topic is gone counts as General.
  const currentTopic =
    thread.topicId && topics.some((topic) => topic.id === thread.topicId)
      ? thread.topicId
      : "general";
  // Only an explicit choice moves the discussion (the topics may load after the page).
  const [topicChoice, setTopicChoice] = useState<string | null>(null);
  const topicId = topicChoice ?? currentTopic;

  const save = useThreadMutation(
    thread.id,
    () =>
      apiFetch<ForumThreadDocument>(`/api/forum/threads/${thread.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          body,
          ...(topicChoice && topicChoice !== currentTopic ? { topicId: topicChoice } : {}),
        }),
      }),
    "Could not save changes"
  );
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/forum/threads/${thread.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum", "threads"] });
      toast({ title: "Discussion deleted" });
      queryClient.invalidateQueries({ queryKey: ["forum", "topics"] });
      router.replace(`/forum/topics/${currentTopic}`);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not delete discussion",
        description: error.message,
        variant: "destructive",
      }),
  });

  if (editing) {
    return (
      <Card className="flex flex-col gap-3">
        <Input
          value={title}
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          className="bg-white text-lg font-semibold"
          aria-label="Title"
        />
        {topics.length > 1 ? (
          <label className="flex items-center gap-2 text-sm text-foreground">
            Topic
            <Select
              value={topicId}
              onChange={(event) => setTopicChoice(event.target.value)}
              className="h-9 px-2"
            >
              {topics.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <Textarea
          rows={6}
          value={body}
          maxLength={5000}
          onChange={(event) => setBody(event.target.value)}
          className="bg-white"
          aria-label="Post"
        />
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
              setTopicChoice(null);
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
    <Card className="group/post flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{thread.title}</h1>
        <div className="flex min-h-[1.5rem] flex-wrap items-center gap-x-2 text-xs text-muted">
          <Byline createdAt={thread.createdAt} editedAt={thread.editedAt} />
          <div className="ml-auto flex items-center gap-3">
            {thread.likes?.length ? (
              <span className="[@media(hover:hover)]:order-last">
                <LikeButton threadId={thread.id} replyId={null} likes={thread.likes} />
              </span>
            ) : null}
            <div className={cn("flex items-center gap-3", ON_HOVER)}>
              {thread.likes?.length ? null : (
                <LikeButton threadId={thread.id} replyId={null} likes={thread.likes} />
              )}
              {mine ? (
                <>
                  <ActionLink onClick={() => setEditing(true)}>Edit</ActionLink>
                  <ActionLink
                    danger
                    onClick={async () => {
                      const everything = !author || othersReplied;
                      if (
                        await confirm({
                          title: everything
                            ? "Delete this discussion and all of its replies?"
                            : "Delete this discussion?",
                          destructive: true,
                        })
                      )
                        remove.mutate();
                    }}
                  >
                    {remove.isPending ? "Deleting…" : "Delete"}
                  </ActionLink>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {thread.body ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {thread.body}
        </p>
      ) : null}
    </Card>
  );
}

export function ThreadClient({ id }: { id: string }) {
  const { user } = useSession();
  const { data, isLoading, error } = useQuery({
    queryKey: ["forum", "thread", id],
    queryFn: () => apiFetch<ForumThreadDocument>(`/api/forum/threads/${id}`),
  });
  const topics = useTopics().data?.topics;
  // A discussion whose topic is gone shows under General.
  const topicId = topics?.some((topic) => topic.id === data?.thread.topicId)
    ? data!.thread.topicId!
    : "general";
  const topicName = topics?.find((topic) => topic.id === topicId)?.name ?? "Forum";

  const repliesUrl = `/api/forum/threads/${id}/replies`;
  const reply = useThreadMutation(
    id,
    (input: { parentId: string | null; body: string }) =>
      apiFetch<ForumThreadDocument>(repliesUrl, { method: "POST", body: JSON.stringify(input) }),
    "Could not post reply"
  );
  const edit = useThreadMutation(
    id,
    ({ replyId, body }: { replyId: string; body: string }) =>
      apiFetch<ForumThreadDocument>(`${repliesUrl}/${replyId}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      }),
    "Could not save changes"
  );
  const remove = useThreadMutation(
    id,
    (replyId: string) =>
      apiFetch<ForumThreadDocument>(`${repliesUrl}/${replyId}`, { method: "DELETE" }),
    "Could not delete comment"
  );
  // Authors manage their own comments; admins can moderate any.
  const mine = (entry: ForumReply) => (!!user && entry.authorId === user.id) || !!user?.isAdmin;

  if (isLoading) return <Loading>Loading discussion…</Loading>;
  if (error || !data) {
    return (
      <NotFoundCard
        message="This discussion could not be found."
        href="/forum"
        label="Back to the forum"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/forum/topics/${topicId}`} label={topicName} />

      <OpeningPost
        key={`${data.thread.editedAt ?? ""}`}
        doc={data}
        currentUserId={user?.id ?? null}
      />

      <Card className="flex flex-col gap-3">
        {/* Search results link to a reply as #reply-<id>. */}
        <CommentTree
          comments={data.replies}
          nesting="any"
          maxIndent={5}
          idPrefix="reply"
          canReply={() => !!user}
          canEdit={mine}
          canDelete={mine}
          onReply={(parentId, body) => reply.mutateAsync({ parentId, body })}
          onEdit={(entry, body) => edit.mutateAsync({ replyId: entry.id, body })}
          onDelete={(entry) => remove.mutateAsync(entry.id)}
          busy={reply.isPending || edit.isPending}
          maxLength={3000}
          renderActions={(entry) => (
            <LikeButton threadId={data.thread.id} replyId={entry.id} likes={entry.likes} />
          )}
          emptyLabel="No replies yet."
        />
        <div className="border-t border-border pt-4">
          <CommentForm
            placeholder="Add to the discussion…"
            submitLabel="Post reply"
            rows={3}
            maxLength={3000}
            busy={reply.isPending}
            onSubmit={(body) => reply.mutateAsync({ parentId: null, body })}
          />
        </div>
      </Card>
    </div>
  );
}
