"use client";

import Link from "next/link";
import { Children, isValidElement, useMemo, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { remarkWikiDirectives } from "@/lib/wiki/directives";
import type { WikiPageSummary } from "@/lib/wiki/store";
import { WIKI_LINK, normalizeWikiLinks, parseWikiLink, wikiLinksIn, type CircleRef } from "@/lib/wiki/links";
import { docFileUrl, findDoc, useCircles, useDocTitles, wikiPagesQuery, type DocRef } from "@/components/wiki/link-data";
import { WikiCircleContext, WikiPollBlock } from "@/components/wiki/poll-block";
import { cn } from "@/lib/utils";

type LinkData = {
  circleId: string;
  /** The page they're on: a page started from a link to a missing one is started from it. */
  pageId?: string;
  /** Undefined until the directory loads. */
  circles: CircleRef[] | undefined;
  /** Each circle's pages, once loaded. */
  pages: Map<string, WikiPageSummary[]>;
  /** Undefined until loaded (or when the page has no document links). */
  docs: DocRef[] | undefined;
};

// Links carry what they are in their Markdown title, for the renderer below.
const MARK = "wiki:";
const mdTitle = (value: string) => ` "${MARK}${value.replace(/["\\]/g, "")}"`;

/**
 * `[[Page title]]`, `[[Circle:Page title]]`, and `[[doc:Document title]]`
 * (each optionally `|shown text`) as ordinary Markdown links: to the page (or,
 * if there's no such page yet, to creating it), or to the document's file.
 */
function linkWikiPages(source: string, { circleId, pageId, circles, pages, docs }: LinkData) {
  return source.replace(WIKI_LINK, (_match, target: string, label?: string) => {
    const clean = (text: string) => text.trim().replace(/[[\]]/g, "");
    if (!circles) return `[${clean(label ?? target)}](#${mdTitle("pending")})`;
    const link = parseWikiLink(target, circleId, circles);
    const text = clean(label ?? link.title);
    if (link.kind === "doc") {
      if (!docs) return `[${text}](#${mdTitle("pending")})`;
      const doc = findDoc(docs, link.title, link.circleId, circleId);
      return doc ? `[${text}](${docFileUrl(doc.id)}${mdTitle(`doc:${doc.circleName}`)})` : `[${text}](#${mdTitle("doc-missing")})`;
    }
    const known = pages.get(link.circleId);
    if (!known) return `[${text}](#${mdTitle("pending")})`;
    const page = known.find((entry) => entry.title.toLowerCase() === link.title.toLowerCase());
    const other = link.circleId !== circleId ? circles.find((circle) => circle.id === link.circleId)?.name : undefined;
    if (!page) {
      const from = pageId && link.circleId === circleId ? `&from=${pageId}` : "";
      return `[${text}](/circles/${link.circleId}/wiki?new=${encodeURIComponent(link.title)}${from}${mdTitle("missing")})`;
    }
    return `[${text}](/circles/${link.circleId}/wiki/${page.slug}${other ? mdTitle(`circle:${other}`) : ""})`;
  });
}

/** A heading's anchor, from its text: "Mowing & tools" → "mowing-tools". */
export const headingSlug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";

function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : isValidElement(child) ? textOf(child.props.children) : ""))
    .join("");
}

/** The page's headings (levels 1–3, outside code blocks), for "On this page". */
export function tableOfContents(markdown: string) {
  const headings: { level: number; text: string; id: string }[] = [];
  let inCode = false;
  for (const line of normalizeWikiLinks(markdown).split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    const match = !inCode && line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const text = match[2]
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, label?: string) => label ?? target)
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    if (text) headings.push({ level: match[1].length, text, id: headingSlug(text) });
  }
  return headings;
}

const heading = (Tag: "h2" | "h3" | "h4", className: string): Components["h1"] =>
  function Heading({ node: _node, children, ...props }) {
    return (
      <Tag id={headingSlug(textOf(children))} className={cn("scroll-mt-24", className)} {...props}>
        {children}
      </Tag>
    );
  };

const components: Components = {
  h1: heading("h2", "mt-6 text-xl font-semibold text-foreground first:mt-0"),
  h2: heading("h3", "mt-5 text-lg font-semibold text-foreground first:mt-0"),
  h3: heading("h4", "mt-4 font-semibold text-foreground first:mt-0"),
  p: ({ node: _node, ...props }) => <p className="leading-relaxed" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="list-disc space-y-1 pl-6" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="list-decimal space-y-1 pl-6" {...props} />,
  blockquote: ({ node: _node, ...props }) => <blockquote className="border-l-4 border-border pl-4 text-muted" {...props} />,
  code: ({ node: _node, className, ...props }) => <code className={cn("rounded bg-accent px-1 py-0.5 text-[0.9em]", className)} {...props} />,
  pre: ({ node: _node, ...props }) => <pre className="overflow-x-auto rounded-lg bg-accent p-3 text-sm [&_code]:bg-transparent [&_code]:p-0" {...props} />,
  hr: () => <hr className="border-border" />,
  // A poll the page holds (`::poll{id="…"}`).
  div: ({ node: _node, ...props }) => {
    const pollId = (props as Record<string, unknown>)["data-poll"];
    return typeof pollId === "string" ? <WikiPollBlock pollId={pollId} /> : <div {...props} />;
  },
  details: ({ node: _node, ...props }) => <details className="wiki-details group rounded-lg border border-border bg-surface px-4 py-2 [&>*+*]:mt-3" {...props} />,
  summary: ({ node: _node, ...props }) => (
    <summary className="-mx-4 -my-2 cursor-pointer select-none rounded-lg px-4 py-2 font-semibold text-foreground hover:bg-accent/60 group-open:rounded-b-none group-open:border-b group-open:border-border" {...props} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th className="border border-border bg-accent/60 px-2 py-1 text-left font-semibold" {...props} />,
  td: ({ node: _node, ...props }) => <td className="border border-border px-2 py-1 align-top" {...props} />,
  a: ({ node: _node, href = "", title, children }) => {
    const mark = title?.startsWith(MARK) ? title.slice(MARK.length) : null;
    const base = "font-medium underline underline-offset-4";
    if (mark === "pending") return <span className="text-foreground-light">{children}</span>;
    if (mark === "doc-missing") {
      return (
        <span className={cn(base, "cursor-help text-destructive decoration-dotted")} title="No document with this title">
          <FileText className="mr-0.5 inline h-[1em] w-[1em] align-[-0.125em]" aria-hidden />
          {children}
        </span>
      );
    }
    if (mark?.startsWith("doc:")) {
      return (
        <a href={href} className={cn(base, "text-secondary-foreground")} target="_blank" rel="noopener" title={`Document · ${mark.slice(4)}`}>
          <FileText className="mr-0.5 inline h-[1em] w-[1em] align-[-0.125em]" aria-hidden />
          {children}
        </a>
      );
    }
    const missing = mark === "missing";
    const className = cn(base, missing ? "text-destructive decoration-dotted" : "text-secondary-foreground");
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={className} title={missing ? "No page yet — create it" : mark?.startsWith("circle:") ? `In the ${mark.slice(7)} wiki` : undefined}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  // Photos added to a wiki show on the page (opening full size); images from elsewhere show as their description.
  img: ({ node: _node, src = "", alt }) =>
    WIKI_IMAGE.test(src) ? (
      <span className="my-1 block">
        <a href={src} target="_blank" rel="noopener" className="block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, already-sized photos */}
          <img src={src} alt={alt ?? ""} loading="lazy" className="max-h-[32rem] w-auto max-w-full rounded-lg border border-border bg-accent/40" />
        </a>
        {alt ? <span className="mt-1 block text-xs text-muted">{alt}</span> : null}
      </span>
    ) : (
      <span className="text-muted">[{alt || "image"}]</span>
    ),
};

/** What a page's links need: the circles, the other wikis it links into, and (if it links any) the documents. */
function useLinkData(source: string, circleId: string, pages: WikiPageSummary[], pageId?: string): LinkData {
  const circles = useCircles();
  const links = useMemo(() => (circles ? wikiLinksIn(source, circleId, circles) : []), [source, circleId, circles]);
  const others = Array.from(new Set(links.flatMap((link) => (link.kind === "page" && link.circleId !== circleId ? [link.circleId] : []))));
  const otherPages = useQueries({ queries: others.map((id) => wikiPagesQuery(id)) });
  const docs = useDocTitles(links.some((link) => link.kind === "doc")).data;
  const byCircle = new Map<string, WikiPageSummary[]>([[circleId, pages]]);
  others.forEach((id, index) => {
    const loaded = otherPages[index]?.data;
    if (loaded) byCircle.set(id, loaded.pages);
    // A wiki that can't be read (turned off, or gone) has no pages to link to.
    else if (otherPages[index]?.isError) byCircle.set(id, []);
  });
  return { circleId, pageId, circles, pages: byCircle, docs };
}

/** A photo uploaded to one of the circles' wikis. */
const WIKI_IMAGE = /^\/api\/circles\/[a-z0-9-]+\/wiki\/images\/[0-9a-f-]{36}$/;

/** A wiki page's Markdown, as formatted text. Raw HTML isn't rendered; photos added to a wiki show, other images as their description. */
export function WikiMarkdown({ source, circleId, pages, pageId }: { source: string; circleId: string; pages: WikiPageSummary[]; pageId?: string }) {
  const linkData = useLinkData(source, circleId, pages, pageId);
  const circleName = linkData.circles?.find((circle) => circle.id === circleId)?.name;
  const wiki = useMemo(() => ({ circleId, circleName }), [circleId, circleName]);
  if (!source.trim()) return <p className="text-sm text-muted">This page is empty.</p>;
  return (
    <WikiCircleContext.Provider value={wiki}>
      <div className="flex flex-col gap-3 break-words text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkWikiDirectives]} components={components}>
          {linkWikiPages(normalizeWikiLinks(source), linkData)}
        </ReactMarkdown>
      </div>
    </WikiCircleContext.Provider>
  );
}
