"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage } from "@/lib/wiki/store";
import { parseWikiLink } from "@/lib/wiki/links";
import { headingSlug, sectionOf } from "@/lib/wiki/sections";
import { noteStyle } from "@/lib/pins/shared";
import { useCircles, wikiPagesQuery } from "@/components/wiki/link-data";
import { WikiCircleContext } from "@/components/wiki/poll-block";
import { WikiMarkdown } from "@/components/wiki/markdown";

/**
 * A page — or one section of it — shown inside another
 * (`::embed{page="Circle:Title" section="Heading"}`): always its current
 * text, edited where it lives, and labelled with the circle that keeps it.
 */

/** The pages already open around this point (`circleId:pageId`), so a page never shows inside itself. */
export const EmbedChain = createContext<string[]>([]);

/** How deep embeds go inside embeds. */
const MAX_DEPTH = 3;

type PageResponse = { page: WikiPage; canEdit: boolean };

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="my-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">{children}</p>;
}

export function EmbedBlock({ target, section }: { target: string; section?: string }) {
  const here = useContext(WikiCircleContext);
  const chain = useContext(EmbedChain);
  const circles = useCircles();
  const link = circles ? parseWikiLink(target, here?.circleId ?? "", circles) : null;
  const circleId = link?.kind === "page" ? link.circleId : "";
  const circle = circles?.find((entry) => entry.id === circleId);
  const list = useQuery({ ...wikiPagesQuery(circleId), enabled: !!circle });
  const summary = link ? list.data?.pages.find((page) => page.title.toLowerCase() === link.title.toLowerCase()) : undefined;
  const key = summary ? `${circleId}:${summary.id}` : "";
  const repeated = !!key && chain.includes(key);
  const tooDeep = chain.length > MAX_DEPTH;
  const full = useQuery({
    queryKey: ["wiki", circleId, summary?.slug ?? ""],
    queryFn: () => apiFetch<PageResponse>(`/api/circles/${circleId}/wiki/${summary!.slug}`),
    enabled: !!summary && !repeated && !tooDeep,
  });

  if (!circles || (circle && list.isLoading) || (summary && !repeated && !tooDeep && full.isLoading)) {
    return <div className="my-2 h-20 animate-pulse rounded-lg bg-accent/40" aria-hidden />;
  }
  if (!link || link.kind !== "page") return <Notice>Only wiki pages can be shown here.</Notice>;
  if (!circle) return <Notice>“{target}” isn&apos;t a page in any circle&apos;s wiki.</Notice>;
  if (list.isError) return <Notice>{circle.name}&apos;s wiki isn&apos;t available.</Notice>;
  const wikiHref = `/circles/${circleId}/wiki`;
  if (!summary) {
    return (
      <Notice>
        “{link.title}” isn&apos;t in{" "}
        <Link href={wikiHref} className="font-medium text-secondary-foreground hover:underline">
          {circle.name}&apos;s wiki
        </Link>{" "}
        any more.
      </Notice>
    );
  }
  const pageHref = `/circles/${circleId}/wiki/${summary.slug}`;
  if (repeated || tooDeep) {
    return (
      <Notice>
        <Link href={pageHref} className="font-medium text-secondary-foreground hover:underline">
          {summary.title}
        </Link>{" "}
        {repeated ? "(shown above)" : `(from ${circle.name})`}
      </Notice>
    );
  }
  const page = full.data?.page;
  if (!page) return <Notice>{summary.title} couldn&apos;t be loaded.</Notice>;
  const body = section ? sectionOf(page.body, section) : page.body;
  if (body === null) {
    return (
      <Notice>
        <Link href={pageHref} className="font-medium text-secondary-foreground hover:underline">
          {page.title}
        </Link>{" "}
        no longer has a section “{section}”.
      </Notice>
    );
  }
  const style = noteStyle(page.color);
  const own = circleId === here?.circleId;
  return (
    <section className="my-3 border-l-4 pl-4" style={{ borderColor: page.color === "white" ? style.edge : style.swatch }} aria-label={`${page.title}${own ? "" : `, from ${circle.name}`}`} data-embedded={page.title}>
      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <span className="font-semibold text-foreground-light">
          {page.title}
          {section ? ` › ${section}` : ""}
        </span>
        {own ? null : <span>from {circle.name}</span>}
        <Link href={section ? `${pageHref}#${headingSlug(section)}` : pageHref} className="inline-flex items-center gap-0.5 font-medium text-secondary-foreground hover:underline">
          Open <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
        {full.data?.canEdit ? (
          <Link href={`${pageHref}?edit=1`} className="inline-flex items-center gap-0.5 font-medium text-secondary-foreground hover:underline">
            <Pencil className="h-3 w-3" aria-hidden /> Edit
          </Link>
        ) : null}
      </p>
      <WikiMarkdown source={body} circleId={circleId} pages={list.data?.pages ?? []} pageId={page.id} />
    </section>
  );
}
