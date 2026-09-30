"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WikiPageSummary } from "@/lib/wiki/store";
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

const components: Components = {
  h1: ({ node: _node, ...props }) => <h2 className="mt-6 text-xl font-semibold text-foreground first:mt-0" {...props} />,
  h2: ({ node: _node, ...props }) => <h3 className="mt-5 text-lg font-semibold text-foreground first:mt-0" {...props} />,
  h3: ({ node: _node, ...props }) => <h4 className="mt-4 font-semibold text-foreground first:mt-0" {...props} />,
  p: ({ node: _node, ...props }) => <p className="leading-relaxed" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="list-disc space-y-1 pl-6" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="list-decimal space-y-1 pl-6" {...props} />,
  blockquote: ({ node: _node, ...props }) => <blockquote className="border-l-4 border-border pl-4 text-muted" {...props} />,
  code: ({ node: _node, className, ...props }) => <code className={cn("rounded bg-accent px-1 py-0.5 text-[0.9em]", className)} {...props} />,
  pre: ({ node: _node, ...props }) => <pre className="overflow-x-auto rounded-lg bg-accent p-3 text-sm [&_code]:bg-transparent [&_code]:p-0" {...props} />,
  hr: () => <hr className="border-border" />,
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkWikiPages(source, circleId, pages)}
      </ReactMarkdown>
    </div>
  );
}
