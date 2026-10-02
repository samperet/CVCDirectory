"use client";

import Link from "next/link";
import { BookOpen, FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type WikiTagKind = "page" | "doc" | "missing" | "doc-missing" | "pending";

/**
 * A wiki link as a tag: a small pill (a page's white with a book, a document's
 * grey-blue, a missing page's dashed red) — not underlined like a web link.
 */
export function WikiTag({
  kind,
  label,
  href,
  circleName,
  newTab = false,
  className,
}: {
  kind: WikiTagKind;
  label: React.ReactNode;
  href?: string;
  /** Another circle's page: whose. */
  circleName?: string | null;
  /** Open in a new tab (from the editor, so nothing's lost). */
  newTab?: boolean;
  className?: string;
}) {
  const Icon =
    kind === "doc" || kind === "doc-missing" ? FileText : kind === "missing" ? Plus : BookOpen;
  const base = cn(
    "mx-px inline-flex max-w-full items-baseline gap-1 whitespace-normal rounded-full border px-2 py-px align-baseline text-[0.92em] font-medium leading-snug !no-underline transition [&_*]:!no-underline",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    kind === "page" && "border-border bg-white text-foreground hover:bg-accent/60",
    kind === "doc" && "border-[#b9cbe0] bg-[#eaf1f8] text-foreground hover:bg-[#dde8f3]",
    kind === "missing" &&
      "border-dashed border-destructive/60 bg-white/70 text-destructive hover:bg-destructive/5",
    kind === "doc-missing" &&
      "cursor-help border-dashed border-destructive/60 bg-white/70 text-destructive",
    kind === "pending" && "border-border bg-white/70 text-foreground-light",
    className
  );
  const title =
    kind === "missing"
      ? "No page yet — create it"
      : kind === "doc-missing"
        ? "No document with this title"
        : kind === "doc"
          ? `Document${circleName ? ` · ${circleName}` : ""}`
          : circleName
            ? `In the ${circleName} wiki`
            : undefined;
  const content = (
    <>
      <Icon className="h-[0.85em] w-[0.85em] shrink-0 self-center opacity-70" aria-hidden />
      <span className="min-w-0 break-words">{label}</span>
      {kind === "page" && circleName ? (
        <span className="shrink-0 text-[0.85em] font-normal text-muted">· {circleName}</span>
      ) : null}
    </>
  );
  if (!href || kind === "doc-missing" || kind === "pending") {
    return (
      <span className={base} title={title} data-wiki-tag={kind}>
        {content}
      </span>
    );
  }
  if (newTab || kind === "doc") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className={base}
        title={title}
        data-wiki-tag={kind}
      >
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={base} title={title} data-wiki-tag={kind}>
      {content}
    </Link>
  );
}
