"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitBranch, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  MAX_NAME,
  isLive,
  versionOf,
  type Perspective,
  type PerspectiveSummary,
} from "@/lib/wiki/perspectives-shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * Under a page's title: its alternative versions still being worked on
 * ("Eve's version · Mow monthly in summer"), each opening to be compared with
 * the page; those no longer worked on (made the page, set aside, withdrawn)
 * on request, for the record; and **Write your own version** — a copy of the
 * page that's yours to change (any resident; not for a meeting's notes).
 */

export type PerspectivesResponse = { perspectives: PerspectiveSummary[]; canStart: boolean };

export const perspectivesQuery = (slug: string) => ({
  queryKey: ["wiki-perspectives", slug],
  queryFn: () => apiFetch<PerspectivesResponse>(`/api/wiki/pages/${slug}/perspectives`),
});

/** What became of a version no longer being worked on. */
const closedAs = (perspective: PerspectiveSummary) =>
  perspective.outcome?.kind === "adopted"
    ? "made the page"
    : perspective.outcome?.kind === "set-aside"
      ? "set aside"
      : "withdrawn";

function Chip({ slug, perspective }: { slug: string; perspective: PerspectiveSummary }) {
  const live = isLive(perspective);
  return (
    <Link
      href={`/wiki/${slug}/versions/${perspective.id}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:bg-accent",
        live ? "bg-white" : "bg-transparent"
      )}
      data-perspective={perspective.id}
    >
      <span className={cn("font-semibold", live ? "text-foreground" : "text-muted")}>
        {versionOf(perspective.createdBy)}
      </span>
      <span className="truncate text-muted">· {perspective.name}</span>
      {live ? (
        perspective.sharedAt ? null : (
          <span className="text-muted">(draft)</span>
        )
      ) : (
        <span className="text-muted">({closedAs(perspective)})</span>
      )}
    </Link>
  );
}

export function PerspectivesBar({ slug }: { slug: string }) {
  const { data } = useQuery(perspectivesQuery(slug));
  const [starting, setStarting] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  if (!data) return null;
  const live = data.perspectives.filter(isLive);
  const closed = data.perspectives.filter((perspective) => !isLive(perspective));
  if (!live.length && !closed.length && !data.canStart) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm" data-perspectives-bar>
      {live.length || closed.length ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
          <GitBranch className="h-3.5 w-3.5" aria-hidden /> Alternative versions
        </span>
      ) : null}
      {live.map((perspective) => (
        <Chip key={perspective.id} slug={slug} perspective={perspective} />
      ))}
      {closed.length ? (
        showClosed ? (
          closed.map((perspective) => (
            <Chip key={perspective.id} slug={slug} perspective={perspective} />
          ))
        ) : (
          <button
            type="button"
            className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setShowClosed(true)}
            data-show-closed
          >
            {live.length ? "and " : ""}
            {closed.length} {closed.length === 1 ? "earlier one" : "earlier ones"}
          </button>
        )
      ) : null}
      {data.canStart ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setStarting(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Write your own version
        </Button>
      ) : null}
      {starting ? <StartDialog slug={slug} onClose={() => setStarting(false)} /> : null}
    </div>
  );
}

function StartDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const start = useMutation({
    mutationFn: () =>
      apiFetch<{ perspective: Perspective }>(`/api/wiki/pages/${slug}/perspectives`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: ({ perspective }) => router.push(`/wiki/${slug}/versions/${perspective.id}?edit=1`),
    onError: (err: Error) =>
      toast({ title: "Could not start it", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog
      title="Write your own version"
      icon={<GitBranch className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) start.mutate();
        }}
      >
        <p className="text-foreground-light">
          It starts as a copy of the page, and it&apos;s yours alone to change. Others can compare
          it with the page, and the page&apos;s circle can make it the page — or put it to a
          meeting.
        </p>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">What does your version do?</span>
          <Input
            value={name}
            maxLength={MAX_NAME}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Mow monthly in summer"
            autoFocus
            className="bg-white"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || start.isPending}>
            {start.isPending ? "Starting…" : "Start writing"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
