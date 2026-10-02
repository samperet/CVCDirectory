"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { ForumLike, ForumReply, ForumThreadDocument } from "@/lib/forum/store";
import { useTopics } from "@/components/forum/topic-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ON_HOVER } from "@/components/ui/hover";
import { useConfirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";
import { Byline, LikeButton, useThreadMutation } from "@/components/forum/post-bits";
import { ActionLink } from "@/components/ui/action-link";

/** A discussion's opening post, with editing, moving to another topic, and deleting for its author (and admins). */

export function OpeningPost({
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
