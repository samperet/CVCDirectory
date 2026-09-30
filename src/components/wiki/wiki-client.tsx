"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { WikiPage, WikiPageSummary } from "@/lib/wiki/store";
import { timeAgo } from "@/lib/time";
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

/** Start a page: give it a title, then write it. */
function NewPageForm({ circleId, initialTitle = "", onCancel }: { circleId: string; initialTitle?: string; onCancel: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle);
  const create = useMutation({
    mutationFn: () => apiFetch<{ page: WikiPage }>(`/api/circles/${circleId}/wiki`, { method: "POST", body: JSON.stringify({ title, body: "" }) }),
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
  return (
    <ul className="flex flex-col divide-y divide-border">
      {pages.map((page) => (
        <li key={page.id} className="py-2.5 first:pt-0 last:pb-0">
          <Link href={`/circles/${circleId}/wiki/${page.slug}`} className="font-medium text-foreground hover:underline">
            {page.title}
          </Link>
          <p className="text-xs text-muted">
            Edited by {page.updatedBy.name} · {timeAgo(page.updatedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The Wiki section on a circle's page: its pages, most recently edited first. */
export function WikiSection({ circleId, limit = 8 }: { circleId: string; limit?: number }) {
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useWikiPages(circleId);
  const pages = data?.pages ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <BookOpen className="h-5 w-5 text-primary" aria-hidden />
          <Link href={`/circles/${circleId}/wiki`} className="hover:underline">
            Wiki
          </Link>
        </h2>
        {data?.canEdit && !adding ? (
          <Button className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> New page
          </Button>
        ) : null}
      </div>
      {adding ? <NewPageForm circleId={circleId} onCancel={() => setAdding(false)} /> : null}
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : pages.length ? (
        <>
          <PageList circleId={circleId} pages={pages.slice(0, limit)} />
          {pages.length > limit ? (
            <Link href={`/circles/${circleId}/wiki`} className="w-fit text-sm font-medium text-secondary-foreground hover:underline">
              All {pages.length} pages
            </Link>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">No pages yet.</p>
      )}
    </div>
  );
}

/** Every page in a circle's wiki (`?new=Title` opens a new page with that title — from a link to a missing page). */
export function WikiIndexClient({ circleId }: { circleId: string }) {
  const circle = useCircle(circleId);
  const params = useSearchParams();
  const requested = params.get("new") ?? "";
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
        {data?.canEdit && !adding ? (
          <Button className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> New page
          </Button>
        ) : null}
      </div>
      {adding && data?.canEdit ? (
        <Card>
          <NewPageForm circleId={circleId} initialTitle={requested} onCancel={() => setAdding(false)} />
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
