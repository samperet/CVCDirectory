"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, LayoutList, Link2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { wikiPageQuery } from "@/components/wiki/link-data";
import { embedText, tableOfContents } from "@/lib/wiki/sections";
import { pageLinkText } from "@/lib/wiki/links";
import { SegmentedControl } from "@/components/ui/segmented";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Found = { circleId: string; circleName: string; title: string; slug: string };

/**
 * Show another page — or one section of it — inside the page being written,
 * or just link to it: find it, then either choose the whole page
 * or a section (an embed, always showing that page's current text) or "Just
 * a link" (`[[Title]]`; links go to the whole page). It goes where the
 * cursor was.
 */
export function EmbedPageDialog({
  circle,
  pageId,
  onChosen,
  onClose,
}: {
  circle: { id: string; name: string };
  /** The page being written (left out of the results). */
  pageId: string;
  /** What to put in the page: an embed (`::embed{…}`) or a link (`[[Title]]`). */
  onChosen: (markdown: string, kind: "embed" | "link") => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Found | null>(null);
  const [section, setSection] = useState("");
  const [as, setAs] = useState<"embed" | "link">("embed");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ["wiki-link-search", circle.id, pageId, search],
    queryFn: () =>
      apiFetch<{ pages: Found[] }>(
        `/api/wiki/link-search?${new URLSearchParams({
          q: search,
          circle: circle.id,
          page: pageId,
        })}`
      ),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const page = useQuery({ ...wikiPageQuery(chosen?.slug ?? ""), enabled: !!chosen });
  const headings = page.data ? tableOfContents(page.data.page.body) : [];
  const insert = () => {
    if (!chosen) return;
    if (as === "link") onChosen(pageLinkText(chosen.title), "link");
    else onChosen(embedText(chosen.title, section || undefined), "embed");
  };

  return (
    <Dialog
      title="Show or link a page"
      icon={<LayoutList className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <p className="text-sm text-muted">
        Show another page — or one section of it — inside this one, always as it currently reads
        (it&apos;s still edited where it lives), or just add a link to it.
      </p>
      {chosen ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
            <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {chosen.title}
            </span>
            <span className="shrink-0 text-xs text-muted">{chosen.circleName}</span>
            <button
              type="button"
              className="text-xs font-medium text-secondary-foreground hover:underline"
              onClick={() => (setChosen(null), setSection(""))}
            >
              Change
            </button>
          </div>
          <SegmentedControl
            label="Add it as"
            value={as}
            onChange={setAs}
            options={[
              { value: "embed", label: "Show it here", icon: LayoutList },
              { value: "link", label: "Just a link", icon: Link2 },
            ]}
            className="self-start"
          />
          {as === "link" ? (
            <p className="text-sm text-foreground-light" data-link-note>
              Adds a link to “{chosen.title}” where the cursor is.
            </p>
          ) : (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold text-foreground">Show</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="embed-section"
                  checked={!section}
                  onChange={() => setSection("")}
                  className="accent-[#3f7d5c]"
                />{" "}
                The whole page
              </label>
              {page.isLoading ? <p className="text-xs text-muted">Finding its sections…</p> : null}
              {headings.map((heading) => (
                <label
                  key={heading.id}
                  className="flex items-center gap-2 text-sm"
                  style={{ paddingLeft: `${(heading.level - 1) * 0.75}rem` }}
                >
                  <input
                    type="radio"
                    name="embed-section"
                    checked={section === heading.text}
                    onChange={() => setSection(heading.text)}
                    className="accent-[#3f7d5c]"
                  />{" "}
                  Just “{heading.text}”
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={insert}>{as === "link" ? "Add link" : "Show it here"}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a page"
            aria-label="Find a page"
            className="bg-white"
          />
          <ul className="flex max-h-72 flex-col overflow-y-auto" role="listbox" aria-label="Pages">
            {(results.data?.pages ?? []).map((found) => (
              <li key={`${found.circleId}:${found.slug}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => setChosen(found)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  )}
                >
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{found.title}</span>
                  <span className="shrink-0 text-xs text-muted">{found.circleName}</span>
                </button>
              </li>
            ))}
            {results.data && !results.data.pages.length ? (
              <li className="px-2 py-1.5 text-sm text-muted">No pages match.</li>
            ) : null}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
