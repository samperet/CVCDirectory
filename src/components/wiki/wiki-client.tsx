"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Network, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { WikiPage, WikiPageSummary } from "@/lib/wiki/store";
import { timeAgo } from "@/lib/time";
import { useSession } from "@/lib/auth/client";
import { noteStyle } from "@/lib/pins/shared";
import { wikiPagesQuery } from "@/components/wiki/link-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

export function useWikiPages(circleId: string) {
  return useQuery(wikiPagesQuery(circleId));
}

function useCircle(circleId: string) {
  const { data } = useQuery({ queryKey: ["directory"], queryFn: () => apiFetch<DirectoryDocument>("/api/directory") });
  return data?.circles.find((circle) => circle.id === circleId);
}

/** Start a page (from a link to one that doesn't exist yet, or as a sub-page): give it a title, then write it. */
export function NewPageForm({ circleId, initialTitle = "", parentId, onCancel }: { circleId: string; initialTitle?: string; parentId?: string; onCancel: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle);
  const create = useMutation({
    mutationFn: () => apiFetch<{ page: WikiPage }>(`/api/circles/${circleId}/wiki`, { method: "POST", body: JSON.stringify({ title, body: "", ...(parentId ? { parentId } : {}) }) }),
    onSuccess: ({ page }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki", circleId] });
      router.push(`/circles/${circleId}/wiki/${page.slug}?edit=1`);
    },
    onError: (error: Error) => toast({ title: "Could not add the page", description: error.message, variant: "destructive" }),
  });
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) create.mutate();
      }}
    >
      <Input autoFocus placeholder="Page title, e.g. How we run meetings" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="bg-white" aria-label="Page title" />
      <div className="flex gap-2">
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          {create.isPending ? "Adding…" : "Add page"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PageList({ circleId, pages }: { circleId: string; pages: WikiPageSummary[] }) {
  const titleOf = new Map(pages.map((page) => [page.id, page.title]));
  return (
    <ul className="flex flex-col divide-y divide-border">
      {pages.map((page) => (
        <li key={page.id} className="py-2.5 first:pt-0 last:pb-0">
          <Link href={`/circles/${circleId}/wiki/${page.slug}`} className="inline-flex items-center gap-2 font-medium text-foreground hover:underline">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: noteStyle(page.color).swatch }} aria-hidden />
            {page.title}
          </Link>
          <p className="pl-[1.125rem] text-xs text-muted">
            {page.parentId && titleOf.has(page.parentId) ? <>From {titleOf.get(page.parentId)} · </> : null}
            Edited by {page.updatedBy.name} · {timeAgo(page.updatedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every page in a circle's wiki — those on the circle's page and those
 * started from inside other pages. (`?new=Title&from=<pageId>` starts a page
 * with that title, from a link to one that doesn't exist yet.)
 */
export function WikiIndexClient({ circleId }: { circleId: string }) {
  const { user } = useSession();
  const circle = useCircle(circleId);
  const params = useSearchParams();
  const requested = params.get("new") ?? "";
  const from = params.get("from") ?? undefined;
  const [adding, setAdding] = useState(!!requested);
  const { data, isLoading, error } = useWikiPages(circleId);
  const [filter, setFilter] = useState("");
  const pages = [...(data?.pages ?? [])]
    .filter((page) => page.title.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={`/circles/${circleId}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {circle?.name ?? "Circle"}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{circle ? `${circle.name} wiki` : "Wiki"}</h1>
        <div className="flex flex-wrap gap-2">
          {user?.isAdmin ? (
            <Button asChild variant="outline" className="gap-1.5">
              <Link href={`/admin/wiki-map?circle=${circleId}`}>
                <Network className="h-4 w-4" /> Map
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <p className="-mt-3 text-sm text-muted">
        Every page, including ones started from inside other pages. New information starts on{" "}
        <Link href={`/circles/${circleId}`} className="font-medium text-secondary-foreground hover:underline">
          {circle?.name ?? "the circle"}&apos;s page
        </Link>
        .
      </p>
      {adding && data?.canEdit ? (
        <Card>
          <NewPageForm circleId={circleId} initialTitle={requested} parentId={from} onCancel={() => setAdding(false)} />
        </Card>
      ) : null}
      {requested && data && !data.canEdit ? <p className="text-sm text-muted">There&apos;s no page called “{requested}” yet.</p> : null}
      <Card className="flex flex-col gap-4">
        {(data?.pages.length ?? 0) > 5 ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input type="search" placeholder="Find a page" value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-white pl-9" aria-label="Find a page" />
          </div>
        ) : null}
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-foreground">{(error as Error).message}</p>
        ) : pages.length ? (
          <PageList circleId={circleId} pages={pages} />
        ) : (
          <p className="text-sm text-muted">{filter ? "No pages match." : "No pages yet."}</p>
        )}
      </Card>
    </div>
  );
}
