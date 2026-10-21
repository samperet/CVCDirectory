"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { moduleTitle, type CircleModule, type InfoFilter } from "@/lib/circles/layout";
import { pagesFor } from "@/lib/circles/info-sort";
import type { Circle } from "@/lib/circles/types";
import { ModuleToggle } from "@/components/circles/circle-modules";
import { AddInformationDialog } from "@/components/circles/add-information-dialog";
import { PageGrid } from "@/components/wiki/page-cards";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCircles } from "@/components/directory/use-directory";
import { SectionHeading } from "@/components/ui/section-heading";
import { Loading } from "@/components/ui/status";
import { useQuery } from "@tanstack/react-query";
import { proposalsQuery } from "@/components/proposals/data";
import { ProposalCards } from "@/components/proposals/proposal-list";

/** The circle whose pages a filter lists, if it lists one circle's. */
export const filterCircle = (filter: InfoFilter) =>
  filter.kind === "pages" ? undefined : filter.circleId;

/**
 * A Filtered Documents module on a circle's page: the pages that match what
 * it was set to show (chosen ones, a circle's, proposals waiting for
 * consent, the latest edited), in the order it was set to (`info-sort.ts`),
 * as cards, in full, or titles only. When it
 * lists this circle's own pages, whoever can start pages for the circle can
 * add one here.
 */
export function InformationModule({
  circle,
  module,
  canAdd,
  narrow,
}: {
  circle: Circle;
  module: CircleModule;
  canAdd: boolean;
  narrow: boolean;
}) {
  const { data, isLoading } = useWikiPages();
  const circles = useCircles();
  const [adding, setAdding] = useState(false);
  const info = module.info;
  const proposedTo = info?.filter.kind === "proposed" ? info.filter.circleId : null;
  const proposals = useQuery({
    ...proposalsQuery({ circle: proposedTo ?? "", status: "proposed" }),
    enabled: !!proposedTo,
  }).data?.proposals;
  if (!info) return null;
  const all = data?.pages ?? [];
  const pages = pagesFor(info, all);
  const listed = filterCircle(info.filter);
  // Adding a page here starts a draft, so a list of proposals doesn't offer it.
  const ownPages = listed === circle.id && info.filter.kind !== "proposed";
  const circleNames = new Map((circles ?? []).map((entry) => [entry.id, entry.name]));
  const listedName = listed ? circleNames.get(listed) : undefined;
  const total = info.filter.kind === "circle" ? pages.length : 0;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading icon={BookOpen} toggle={<ModuleToggle />}>
          <span className="min-w-0 break-words">{moduleTitle(module)}</span>
        </SectionHeading>
        {canAdd && ownPages ? (
          <Button className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add a page
          </Button>
        ) : null}
      </div>
      {proposals?.length ? <ProposalCards proposals={proposals} /> : null}
      {isLoading ? (
        <Loading />
      ) : pages.length ? (
        <PageGrid
          pages={pages}
          all={all}
          view={info.view}
          circleId={circle.id}
          circleNames={circleNames}
          narrow={narrow}
        />
      ) : info.filter.kind === "proposed" && proposals?.length ? null : (
        <p className="text-sm text-muted">
          {info.filter.kind === "proposed"
            ? "Nothing is waiting for consent."
            : canAdd && ownPages
              ? "Nothing here yet — add the first page."
              : "Nothing here yet."}
        </p>
      )}
      {total && listed && listedName ? (
        <div className="border-t border-border pt-3 text-sm">
          <Link
            href={`/documents?circle=${listed}`}
            className="font-medium text-secondary-foreground hover:underline"
          >
            All {listedName} documents
          </Link>
        </div>
      ) : null}
      {adding ? <AddInformationDialog circle={circle} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}
