"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Lock, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage, WikiPageSummary } from "@/lib/wiki/store";
import { timeAgo } from "@/lib/time";
import { useSession } from "@/lib/auth/client";
import { noteStyle } from "@/lib/pins/shared";
import { useCircles, wikiPagesQuery } from "@/components/wiki/link-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

/** The wiki's pages that you can see (and the circles you can start pages for). */
export function useWikiPages() {
  return useQuery(wikiPagesQuery());
}

/**
 * Start a page: give it a title, then write it. Started from a link in
 * another page (`from`), it's kept by that page's circle; otherwise choose
 * which of your circles keeps it.
 */
export function NewPageForm({ initialTitle = "", from, keeper: preferred, onCancel }: { initialTitle?: string; from?: string; keeper?: string; onCancel: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const keepers = useWikiPages().data?.keepers ?? [];
  const [title, setTitle] = useState(initialTitle);
  const [chosen, setChosen] = useState(preferred ?? "");
  const keeper = chosen || (keepers.some((circle) => circle.id === "community") ? "community" : keepers[0]?.id) || "";
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ page: WikiPage }>("/api/wiki/pages", {
        method: "POST",
        body: JSON.stringify({ title, body: "", ...(from && !chosen ? { from } : { keeper }) }),
      }),
    onSuccess: ({ page }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      router.push(`/wiki/${page.slug}?edit=1`);
    },
    onError: (error: Error) => toast({ title: "Could not add the page", description: error.message, variant: "destructive" }),
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) create.mutate();
      }}
    >
      <Input autoFocus placeholder="Page title, e.g. How we run meetings" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="bg-white" aria-label="Page title" />
      {!from && keepers.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Parent circle
          <select value={keeper} onChange={(event) => setChosen(event.target.value)} className="h-9 rounded-md border border-border bg-white px-2 text-sm text-foreground">
            {keepers.map((circle) => (
              <option key={circle.id} value={circle.id}>
                {circle.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={!title.trim() || create.isPending || (!from && !keeper)}>
          {create.isPending ? "Adding…" : "Add page"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PageRow({ page, circleName }: { page: WikiPageSummary; circleName: (id: string) => string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Link href={`/wiki/${page.slug}`} className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground hover:underline">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: noteStyle(page.color).swatch }} aria-hidden />
        <span className="truncate">{page.title}</span>
        {page.view.kind !== "everyone" ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Not everyone can see this page" /> : null}
      </Link>
      <p className="pl-[1.125rem] text-xs text-muted">
        {circleName(page.keeper)} · edited {timeAgo(page.updatedAt)}
      </p>
    </div>
  );
}

/**
 * The wiki: every page you can see, by title — found by search, or
 * narrowed to the pages one circle keeps (`?keeper=`). Pages connect by
 * linking to each other. New pages start here (`?new=Title&from=<pageId>`
 * starts one from a link to a page that doesn't exist yet).
 */
export function WikiHomeClient() {
  const { user } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const circles = useCircles();
  const requested = params.get("new") ?? "";
  const from = params.get("from") ?? undefined;
  const keeperFilter = params.get("keeper") ?? "";
  const [adding, setAdding] = useState(!!requested);
  const { data, isLoading, error } = useWikiPages();
  const [filter, setFilter] = useState("");
  const circleName = (id: string) => circles?.find((circle) => circle.id === id)?.name ?? "a circle";
  const all = useMemo(() => data?.pages ?? [], [data]);
  const keepersWithPages = useMemo(() => Array.from(new Set(all.map((page) => page.keeper))).sort((a, b) => circleName(a).localeCompare(circleName(b))), [all, circles]); // eslint-disable-line react-hooks/exhaustive-deps
  const wanted = filter.trim().toLowerCase();
  const listed = all.filter((page) => (!keeperFilter || page.keeper === keeperFilter) && (!wanted || page.title.toLowerCase().includes(wanted)));
  const canStart = (data?.keepers.length ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <BookOpen className="h-6 w-6 text-primary" aria-hidden /> Wiki
        </h1>
        <div className="flex flex-wrap gap-2">
          {canStart ? (
            <Button className="gap-1" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> New page
            </Button>
          ) : null}
        </div>
      </div>
      <p className="-mt-3 text-sm text-muted">One wiki for all of CVC. Each page has a parent circle, which decides who can see and edit it. Pages connect by linking to each other.</p>
      {adding ? (
        <Card>
          <NewPageForm initialTitle={requested} from={from} keeper={keeperFilter || undefined} onCancel={() => setAdding(false)} />
        </Card>
      ) : null}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input type="search" placeholder="Find a page" value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-white pl-9" aria-label="Find a page" />
          </div>
          <select
            value={keeperFilter}
            onChange={(event) => router.replace(event.target.value ? `/wiki?keeper=${event.target.value}` : "/wiki")}
            className="h-10 rounded-md border border-border bg-white px-2 text-sm text-foreground"
            aria-label="Parent circle"
          >
            <option value="">Every parent circle</option>
            {keepersWithPages.map((id) => (
              <option key={id} value={id}>
                {circleName(id)}
              </option>
            ))}
          </select>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-foreground">{(error as Error).message}</p>
        ) : !listed.length ? (
          <p className="text-sm text-muted">{wanted || keeperFilter ? "No pages match." : "No pages yet."}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {[...listed]
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((page) => (
                <li key={page.id} className="flex py-2 first:pt-0 last:pb-0">
                  <PageRow page={page} circleName={circleName} />
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
