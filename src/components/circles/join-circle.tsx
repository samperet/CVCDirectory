"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { possessive } from "@/lib/text";
import type { Circle, CircleApplication } from "@/lib/circles/types";
import { Textarea } from "@/components/ui/textarea";

/**
 * Joining a circle from somewhere else in the app (moving a page to a circle
 * you're not in): the best way in as the circle takes members — **join**
 * straight away where anyone can join, or **ask to join** (with a note, if
 * you like) where its members approve — or, your request already sent,
 * that it's waiting. The same request as the Members module's
 * (`POST /api/circles/<id>/join`).
 */

/** How you can join a circle now. */
export type JoinWay = "join" | "ask" | "waiting";

/** The best way to join `circle`, and joining (or asking) — `null` while it's being found out. */
export function useJoinCircle(circle: Circle) {
  const queryClient = useQueryClient();
  const applications = useQuery({
    queryKey: ["circle-applications", circle.id],
    queryFn: () =>
      apiFetch<{ mine: CircleApplication | null }>(`/api/circles/${circle.id}/applications`),
  });
  const way: JoinWay | null =
    circle.joinPolicy === "open"
      ? "join"
      : applications.data
        ? applications.data.mine
          ? "waiting"
          : "ask"
        : null;
  const join = useMutation({
    mutationFn: (message: string) =>
      apiFetch<{ joined: boolean }>(`/api/circles/${circle.id}/join`, {
        method: "POST",
        body: JSON.stringify({ message: message.trim() || undefined }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["directory"] });
      void queryClient.invalidateQueries({ queryKey: ["circle-applications"] });
    },
  });
  return { way, join };
}

/**
 * The way in, in words — "Anyone can join Land Care Circle", "…its members
 * approve who joins" (with a box for a note to them), or "your request is
 * waiting".
 */
export function JoinWayNote({
  circle,
  way,
  note,
  onNote,
}: {
  circle: Circle;
  way: JoinWay | null;
  note: string;
  onNote: (note: string) => void;
}) {
  if (!way) return <p className="h-10 animate-pulse rounded-lg bg-accent/50" aria-hidden />;
  if (way === "waiting")
    return (
      <p
        className="flex items-start gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm text-foreground"
        data-join-way="waiting"
      >
        <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        You&apos;ve asked to join {circle.name}; its members haven&apos;t answered yet.
      </p>
    );
  return (
    <div
      className="flex flex-col gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm text-foreground"
      data-join-way={way}
    >
      <p className="flex items-start gap-2">
        <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        {way === "join"
          ? `Anyone can join ${circle.name} — you can straight away.`
          : `${possessive(circle.name)} members approve who joins: ask, and they'll let you know.`}
      </p>
      {way === "ask" ? (
        <Textarea
          rows={2}
          value={note}
          maxLength={500}
          onChange={(event) => onNote(event.target.value)}
          placeholder="A note to them (optional) — why you'd like to join"
          aria-label={`A note to ${circle.name}`}
          className="bg-white"
        />
      ) : null}
    </div>
  );
}
