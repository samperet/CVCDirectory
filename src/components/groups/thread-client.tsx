"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Mail } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { GroupPost, GroupThread } from "@/lib/groups/shared";
import type { Poll } from "@/lib/polls/shared";
import { BackLink } from "@/components/layout/back-link";
import { CommentTree } from "@/components/comments/comment-tree";
import { CommentForm } from "@/components/comments/comment-form";
import { PollView } from "@/components/polls/poll-view";
import { Card } from "@/components/ui/card";
import { NotFoundCard, Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";

type ThreadData = {
  thread: GroupThread;
  posts: GroupPost[];
  poll: Poll | null;
  pollAuthorPersonId: string | null;
  circle: { id: string; name: string };
  canPost: boolean;
  canModerate: boolean;
  personId: string;
};

/**
 * One conversation in a circle's Forum — the page its notifications open:
 * its messages in order, its poll, and a reply box for the circle's members
 * (who get an app notification for each reply). Messages that came by the
 * group email the app once had still say so.
 */
export function GroupThreadClient({ circleId, threadId }: { circleId: string; threadId: string }) {
  const { toast } = useToast();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const key = ["group-thread", circleId, threadId];
  const base = `/api/circles/${circleId}/forum/${threadId}`;
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<ThreadData>(base),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["group-forum", circleId] });
  };
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const reply = useMutation({
    mutationFn: (body: string) =>
      apiFetch(base, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: refresh,
    onError: fail("Could not reply"),
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiFetch(`${base}/posts/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
    onSuccess: refresh,
    onError: fail("Could not save"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/posts/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: fail("Could not delete"),
  });
  const pollRequest = async (method: "POST" | "PATCH", body: object) => {
    const { poll } = await apiFetch<{ poll: Poll }>(`${base}/poll`, {
      method,
      body: JSON.stringify(body),
    });
    queryClient.setQueryData<ThreadData>(key, (current) =>
      current ? { ...current, poll } : current
    );
  };

  if (isLoading) return <Loading />;
  if (error || !data)
    return (
      <NotFoundCard
        error={error}
        message="That conversation wasn't found."
        href={`/circles/${circleId}`}
        label="Back to the circle"
      />
    );
  const mine = (post: GroupPost) => post.authorId === user?.id;
  const live = data.posts.filter((post) => !post.deletedAt);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <BackLink href={`/circles/${circleId}`} label={data.circle.name} />
      <Card className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{data.thread.title}</h1>
          <p className="text-xs text-muted">
            {data.circle.name}&apos;s Forum · {live.length} message{live.length === 1 ? "" : "s"}
          </p>
        </div>
        {data.poll ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-white/80 p-4">
            <h2 className="flex items-start gap-2 font-semibold text-foreground">
              <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{" "}
              {data.thread.title}
            </h2>
            <PollView
              id={`group-poll-${threadId}`}
              poll={data.poll}
              voterKey={data.personId}
              canClose={data.canModerate || data.pollAuthorPersonId === data.personId}
              onVote={(optionIds) => pollRequest("POST", { optionIds })}
              onSetClosed={(closed) => pollRequest("PATCH", { closed })}
              cantVoteReason={
                data.canPost ? null : `Only ${data.circle.name}'s members answer this poll`
              }
            />
          </div>
        ) : null}
        <CommentTree
          comments={data.posts}
          roots={data.posts.filter((post) => !post.parentId)}
          nesting="none"
          idPrefix="message"
          className="-mx-3"
          canEdit={mine}
          canDelete={(post) => mine(post) || data.canModerate}
          onEdit={(post, body) => edit.mutateAsync({ id: post.id, body })}
          onDelete={(post) => remove.mutateAsync(post.id)}
          busy={edit.isPending}
          maxLength={50000}
          renderExtras={(post) =>
            post.via === "email" || post.skippedAttachments ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                {post.via === "email" ? (
                  <>
                    <Mail className="h-3 w-3" aria-hidden /> by email
                  </>
                ) : null}
                {post.skippedAttachments
                  ? ` · ${post.skippedAttachments} attachment${
                      post.skippedAttachments === 1 ? "" : "s"
                    } not kept`
                  : ""}
              </p>
            ) : null
          }
          deleteConfirm={() => ({
            title: "Delete this message?",
            body: "It's removed for everyone.",
          })}
        />
        {data.canPost ? (
          <CommentForm
            placeholder={`Reply to everyone in ${data.circle.name}…`}
            submitLabel="Reply"
            rows={3}
            maxLength={50000}
            busy={reply.isPending}
            onSubmit={(body) => reply.mutateAsync(body)}
          />
        ) : (
          <p className="text-sm text-muted">Only {data.circle.name}&apos;s members reply here.</p>
        )}
      </Card>
    </div>
  );
}
