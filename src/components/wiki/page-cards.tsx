"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import type { InfoView } from "@/lib/circles/layout";
import { pageStyle } from "@/lib/wiki/colors";
import type { WikiPageSummary } from "@/lib/wiki/store";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { wikiPageQuery } from "@/components/wiki/link-data";
import { cn } from "@/lib/utils";

/**
 * Wiki pages shown on a circle's page: as cards with their opening lines,
 * each in full, or just their titles.
 */

const href = (page: Pick<WikiPageSummary, "slug">) => `/wiki/${page.slug}`;

// A slight, steady tilt per card, as if stuck up by hand.
const TILTS = [
  "-rotate-[0.6deg]",
  "rotate-[0.5deg]",
  "-rotate-[0.3deg]",
  "rotate-[0.8deg]",
  "rotate-0",
];
const tiltFor = (id: string) =>
  TILTS[Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % TILTS.length];

/** A page as a card: its colour, title, and opening lines; the whole card opens it. */
export function PageCard({ page, circleName }: { page: WikiPageSummary; circleName?: string }) {
  const style = pageStyle(page.color);
  return (
    <article
      className={cn(
        "relative flex min-h-[8.5rem] flex-col gap-1.5 rounded-md border p-4 pt-3.5 shadow-soft transition hover:rotate-0 hover:shadow-elev focus-within:rotate-0",
        tiltFor(page.id)
      )}
      style={{ backgroundColor: style.paper, borderColor: style.edge }}
      aria-label={page.title}
    >
      <h3 className="line-clamp-2 font-semibold leading-snug text-foreground">
        <Link
          href={href(page)}
          className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {page.title}
        </Link>
      </h3>
      {page.excerpt ? (
        <p className="line-clamp-4 whitespace-pre-line text-sm leading-snug text-foreground-light">
          {page.excerpt}
        </p>
      ) : null}
      {circleName ? (
        <p className="mt-auto pt-1 text-xs text-foreground-light/80">{circleName}</p>
      ) : null}
    </article>
  );
}

/** A page in full, as it reads on its own page (its opening lines until the rest loads). */
export function FullPage({
  page,
  pages,
  circleName,
}: {
  page: WikiPageSummary;
  pages: WikiPageSummary[];
  circleName?: string;
}) {
  const style = pageStyle(page.color);
  const { data } = useQuery(wikiPageQuery(page.slug));
  return (
    <article
      className="flex min-w-0 flex-col gap-3 rounded-lg border p-4 shadow-soft sm:p-5"
      style={{ backgroundColor: style.paper, borderColor: style.edge }}
      aria-label={page.title}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-snug text-foreground">
            <Link href={href(page)} className="hover:underline">
              {page.title}
            </Link>
          </h3>
          {circleName ? <p className="text-xs text-foreground-light/80">{circleName}</p> : null}
        </div>
        <Link
          href={href(page)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-black/5"
          title="Open the page"
        >
          Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {data ? (
        <div className="min-w-0">
          <WikiMarkdown
            source={data.page.body}
            circleId={page.keeper}
            pages={pages}
            pageId={page.id}
          />
        </div>
      ) : (
        <p className="whitespace-pre-line text-sm text-foreground-light">{page.excerpt}</p>
      )}
    </article>
  );
}

/** Just the titles, each on its colour, as a compact list. */
export function PageTitleList({
  pages,
  circleName,
}: {
  pages: WikiPageSummary[];
  circleName: (page: WikiPageSummary) => string | undefined;
}) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {pages.map((page) => {
        const style = pageStyle(page.color);
        const circle = circleName(page);
        return (
          <li
            key={page.id}
            className="relative flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2 transition hover:shadow-soft"
            style={{ backgroundColor: style.paper, borderColor: style.edge }}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-sm border border-black/10"
              style={{ backgroundColor: style.swatch }}
              aria-hidden
            />
            <Link
              href={href(page)}
              className="min-w-0 flex-1 truncate text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {page.title}
            </Link>
            {circle ? (
              <span className="shrink-0 text-xs text-foreground-light/80">{circle}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const SHOWN = { full: 3, summary: 6 } as const;

/**
 * Pages as `view` says: cards (the first six, then "+N more"), each in full
 * (the first three), or titles (all). Pages kept by another circle than
 * `circleId` name their circle.
 */
export function PageGrid({
  pages,
  all,
  view,
  circleId,
  circleNames,
  narrow = false,
}: {
  pages: WikiPageSummary[];
  /** Every page you can see (for links in pages shown in full). */
  all: WikiPageSummary[];
  view: InfoView;
  circleId: string;
  circleNames: Map<string, string>;
  /** In a narrow module: one card a row. */
  narrow?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const circleName = (page: WikiPageSummary) =>
    page.keeper === circleId ? undefined : circleNames.get(page.keeper);
  if (view === "titles") return <PageTitleList pages={pages} circleName={circleName} />;
  const limit = SHOWN[view];
  const shown = expanded ? pages : pages.slice(0, limit);
  return (
    <>
      {view === "full" ? (
        <div className="flex flex-col gap-4">
          {shown.map((page) => (
            <FullPage key={page.id} page={page} pages={all} circleName={circleName(page)} />
          ))}
        </div>
      ) : (
        <div className={cn("grid gap-4", narrow ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3")}>
          {shown.map((page) => (
            <PageCard key={page.id} page={page} circleName={circleName(page)} />
          ))}
        </div>
      )}
      {pages.length > limit ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-fit text-sm font-medium text-secondary-foreground hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? "Show fewer" : `+${pages.length - limit} more`}
        </button>
      ) : null}
    </>
  );
}
