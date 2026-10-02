"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { moduleTitle, type CircleModule, type InfoFilter } from "@/lib/circles/layout";
import type { Circle } from "@/lib/directory/types";
import type { WikiPageSummary } from "@/lib/wiki/store";
import { ModuleToggle } from "@/components/circles/circle-modules";
import { AddInformationDialog } from "@/components/circles/add-information-dialog";
import { PageGrid } from "@/components/wiki/page-cards";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCircles } from "@/components/directory/use-directory";

/**
 * The pages a filter picks, of those you can see: chosen ones in their
 * order, a circle's by title, or the most recently edited first.
 */
export function pagesFor(filter: InfoFilter, pages: WikiPageSummary[]): WikiPageSummary[] {
  if (filter.kind === "pages") {
    const byId = new Map(pages.map((page) => [page.id, page]));
    return filter.pageIds.flatMap((id) => byId.get(id) ?? []);
  }
  if (filter.kind === "circle") return pages.filter((page) => page.keeper === filter.circleId).sort((a, b) => a.title.localeCompare(b.title));
  return pages
    .filter((page) => !filter.circleId || page.keeper === filter.circleId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, filter.limit);
}

/** The circle whose pages a filter lists, if it lists one circle's. */
export const filterCircle = (filter: InfoFilter) => (filter.kind === "pages" ? undefined : filter.circleId);

/**
 * An Information module on a circle's page: the wiki pages it was set to
 * show (only those the reader can see), as cards, in full, or titles only.
 * When it lists this circle's own pages, whoever can start pages for the
 * circle can add one here.
 */
export function InformationModule({ circle, module, canAdd, narrow }: { circle: Circle; module: CircleModule; canAdd: boolean; narrow: boolean }) {
  const { data, isLoading } = useWikiPages();
  const circles = useCircles();
  const [adding, setAdding] = useState(false);
  const info = module.info;
  if (!info) return null;
  const all = data?.pages ?? [];
  const pages = pagesFor(info.filter, all);
  const listed = filterCircle(info.filter);
  const ownPages = listed === circle.id;
  const circleNames = new Map((circles ?? []).map((entry) => [entry.id, entry.name]));
  const listedName = listed ? circleNames.get(listed) : undefined;
  const total = info.filter.kind === "circle" ? pages.length : 0;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground">
          <ModuleToggle />
          <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden /> <span className="min-w-0 break-words">{moduleTitle(module)}</span>
        </h2>
        {canAdd && ownPages ? (
          <Button className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add Information
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : pages.length ? (
        <PageGrid pages={pages} all={all} view={info.view} circleId={circle.id} circleNames={circleNames} narrow={narrow} />
      ) : (
        <p className="text-sm text-muted">{canAdd && ownPages ? "Nothing here yet — add the first piece of information." : "Nothing here yet."}</p>
      )}
      {total && listed && listedName ? (
        <div className="border-t border-border pt-3 text-sm">
          <Link href={`/wiki?keeper=${listed}`} className="font-medium text-secondary-foreground hover:underline">
            All {listedName} pages in the wiki ({total})
          </Link>
        </div>
      ) : null}
      {adding ? <AddInformationDialog circle={circle} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}
