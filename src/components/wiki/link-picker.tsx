"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Link2, Plus, X } from "lucide-react";
import { featureEnabled } from "@/lib/circles/features";
import { docLinkText, pageLinkText } from "@/lib/wiki/links";
import { useCircles, useDocTitles, wikiPagesQuery } from "@/components/wiki/link-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "page" | "doc";

/**
 * Choose what to link to — a page in this or another circle's wiki, or a
 * document — and get the `[[…]]` text for it.
 */
function LinkPickerDialog({ circleId, pageId, onPick, onClose }: { circleId: string; pageId?: string; onPick: (text: string) => void; onClose: () => void }) {
  const circles = useCircles();
  const [tab, setTab] = useState<Tab>("page");
  const [wiki, setWiki] = useState(circleId);
  const [query, setQuery] = useState("");
  const pages = useQuery({ ...wikiPagesQuery(wiki), enabled: tab === "page" });
  const docs = useDocTitles(tab === "doc");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const wikis = useMemo(
    () =>
      (circles ?? [])
        .filter((circle) => circle.id === circleId || featureEnabled(circle, "wiki"))
        .sort((a, b) => Number(b.id === circleId) - Number(a.id === circleId) || a.name.localeCompare(b.name)),
    [circles, circleId]
  );
  const circle = circles?.find((entry) => entry.id === wiki);
  const wanted = query.trim().toLowerCase();

  const pageTitles = (pages.data?.pages ?? [])
    .filter((page) => page.id !== pageId && page.title.toLowerCase().includes(wanted))
    .map((page) => page.title)
    .sort((a, b) => a.localeCompare(b));
  const exact = (pages.data?.pages ?? []).some((page) => page.title.toLowerCase() === wanted);

  const docMatches = useMemo(
    () =>
      (docs.data ?? [])
        .filter((doc) => doc.title.toLowerCase().includes(wanted))
        .sort((a, b) => Number(b.circleId === circleId) - Number(a.circleId === circleId) || a.title.localeCompare(b.title))
        .slice(0, 60),
    [docs.data, wanted, circleId]
  );
  const pickDoc = (id: string) => {
    const doc = docs.data?.find((entry) => entry.id === id);
    if (!doc) return;
    const ambiguous = (docs.data ?? []).some((other) => other.id !== doc.id && other.circleId !== doc.circleId && other.title.toLowerCase() === doc.title.toLowerCase());
    onPick(docLinkText(doc.title, circles?.find((entry) => entry.id === doc.circleId), circleId, ambiguous));
  };

  const row = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-link-picker"
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-elev"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="wiki-link-picker" className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Link2 className="h-5 w-5 text-primary" aria-hidden /> Add a link
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="inline-flex w-fit rounded-full border border-border bg-background p-0.5 text-sm" role="tablist">
          {(
            [
              ["page", "Wiki page", BookOpen],
              ["doc", "Document", FileText],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition",
                tab === value ? "bg-primary text-primary-foreground shadow-soft" : "text-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "page" ? (
          <select
            value={wiki}
            onChange={(event) => setWiki(event.target.value)}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-foreground"
            aria-label="Which wiki"
          >
            {wikis.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id === circleId ? `This wiki (${entry.name})` : `${entry.name} wiki`}
              </option>
            ))}
          </select>
        ) : null}
        <Input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tab === "page" ? "Find a page, or type a new one's title" : "Find a document by title"}
          className="bg-white"
          aria-label={tab === "page" ? "Find a page" : "Find a document"}
        />

        <div className="-mx-1 min-h-[8rem] overflow-y-auto px-1">
          {tab === "page" ? (
            pages.isLoading ? (
              <p className="px-2.5 py-1.5 text-sm text-muted">Loading…</p>
            ) : (
              <ul className="flex flex-col">
                {pageTitles.map((title) => (
                  <li key={title}>
                    <button type="button" className={row} onClick={() => circle && onPick(pageLinkText(title, circle, circleId))}>
                      <BookOpen className="h-4 w-4 shrink-0 text-muted" aria-hidden /> <span className="truncate">{title}</span>
                    </button>
                  </li>
                ))}
                {wanted && !exact && circle ? (
                  <li>
                    <button type="button" className={row} onClick={() => onPick(pageLinkText(query.trim().replace(/[[\]|]/g, ""), circle, circleId))}>
                      <Plus className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      <span className="truncate">
                        Link a new page, “{query.trim()}” <span className="text-muted">(to write later)</span>
                      </span>
                    </button>
                  </li>
                ) : null}
                {!pageTitles.length && !wanted ? <li className="px-2.5 py-1.5 text-sm text-muted">No pages in this wiki yet.</li> : null}
              </ul>
            )
          ) : docs.isLoading ? (
            <p className="px-2.5 py-1.5 text-sm text-muted">Loading…</p>
          ) : docMatches.length ? (
            <ul className="flex flex-col">
              {docMatches.map((doc) => (
                <li key={doc.id}>
                  <button type="button" className={row} onClick={() => pickDoc(doc.id)}>
                    <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                    <span className="shrink-0 text-xs text-muted">{doc.circleName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-1.5 text-sm text-muted">{wanted ? "No documents match." : "No documents yet."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** A button that opens the link picker; `onPick` gets the `[[…]]` text to insert. */
export function LinkPicker({
  circleId,
  pageId,
  onPick,
  className,
  compact = false,
}: {
  circleId: string;
  pageId?: string;
  onPick: (text: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(true)}
        title="Link a wiki page (in any circle) or a document"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-foreground transition hover:bg-accent",
          compact ? "h-8 px-2" : "h-9 border border-border bg-white px-3",
          className
        )}
      >
        <BookOpen className="h-4 w-4" aria-hidden /> Link page or doc
      </button>
      {open
        ? createPortal(
            <LinkPickerDialog
              circleId={circleId}
              pageId={pageId}
              onClose={() => setOpen(false)}
              onPick={(text) => {
                setOpen(false);
                onPick(text);
              }}
            />,
            document.body
          )
        : null}
    </>
  );
}
