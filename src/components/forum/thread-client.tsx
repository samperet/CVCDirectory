"use client";

import { useQuery } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumLike, ForumReply, ForumThreadDocument } from "@/lib/forum/store";
import { useTopics } from "@/components/forum/topic-client";
import { Card } from "@/components/ui/card";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentTree } from "@/components/comments/comment-tree";
import { Loading, NotFoundCard } from "@/components/ui/status";
import { LikeButton, useThreadMutation } from "@/components/forum/post-bits";
import { OpeningPost } from "@/components/forum/opening-post";

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
