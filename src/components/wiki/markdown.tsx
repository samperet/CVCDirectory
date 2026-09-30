"use client";

import Link from "next/link";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { remarkWikiDirectives } from "@/lib/wiki/directives";
import type { WikiPageSummary } from "@/lib/wiki/store";
import { normalizeWikiLinks } from "@/lib/wiki/links";
import { cn } from "@/lib/utils";

/**
 * `[[Page title]]` (or `[[Page title|shown text]]`) links to that page in the
 * same circle's wiki — or, if there's no such page yet, to creating it.
 */
function linkWikiPages(source: string, circleId: string, pages: WikiPageSummary[]) {
  return source.replace(/\[\[([^\]|\n]{1,120})(?:\|([^\]\n]{1,120}))?\]\]/g, (_match, target: string, label?: string) => {
    const title = target.trim();
    const page = pages.find((entry) => entry.title.toLowerCase() === title.toLowerCase());
    const href = page ? `/circles/${circleId}/wiki/${page.slug}` : `/circles/${circleId}/wiki?new=${encodeURIComponent(title)}`;
    const text = (label ?? title).trim().replace(/[[\]]/g, "");
    return `[${text}](${href}${page ? "" : " \"missing\""})`;
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
    const missing = title === "missing";
    const className = cn("font-medium underline underline-offset-4", missing ? "text-destructive decoration-dotted" : "text-secondary-foreground");
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={className} title={missing ? "No page yet — create it" : undefined}>
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
  img: ({ node: _node, alt }) => <span className="text-muted">[{alt || "image"}]</span>,
};

/** A wiki page's Markdown, as formatted text. Raw HTML isn't rendered, and images show as their description. */
export function WikiMarkdown({ source, circleId, pages }: { source: string; circleId: string; pages: WikiPageSummary[] }) {
  if (!source.trim()) return <p className="text-sm text-muted">This page is empty.</p>;
  return (
    <div className="flex flex-col gap-3 break-words text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkWikiDirectives]} components={components}>
        {linkWikiPages(normalizeWikiLinks(source), circleId, pages)}
      </ReactMarkdown>
    </div>
  );
}
