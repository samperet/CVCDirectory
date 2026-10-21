"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import { BookOpen, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Found = { circleId: string; circleName: string; title: string; slug: string };

/**
 * Link the selected words to a page (from the right-click menu's "Link to a
 * page…"): find one by title — this circle's pages first — or, when no page
 * has the typed title, start a new one. The words become the link's label
 * (`[[Title|words]]`, or `[[Title]]` when they are the title). A new page is
 * made when this page is saved, kept by its circle, as the @ menu's new
 * pages are (`onCreatePage`).
 */
export function LinkWordsDialog({
  editor,
  circle,
  pageId,
  canCreate,
  onCreatePage,
  onClose,
}: {
  editor: Editor;
  circle: { id: string; name: string };
  /** The page being written (left out of the results). */
  pageId: string;
  /** Whether a new page may be started from here (not from an alternative version). */
  canCreate: boolean;
  onCreatePage: (title: string) => void;
  onClose: () => void;
}) {
  // The selection as it was when the menu was used: what's linked, and where.
  const [range] = useState(() => {
    const { from, to } = editor.state.selection;
    return { from, to, words: editor.state.doc.textBetween(from, to, " ").trim() };
  });
  const [query, setQuery] = useState(range.words);
  const [search, setSearch] = useState(range.words);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ["wiki-link-search", circle.id, pageId, search],
    queryFn: () =>
      apiFetch<{ pages: Found[]; exists: boolean }>(
        `/api/wiki/link-search?${new URLSearchParams({
          q: search,
          circle: circle.id,
          page: pageId,
        })}`
      ),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const pages = useMemo(() => results.data?.pages ?? [], [results.data]);
  const typed = query.trim();
  const offerNew =
    canCreate &&
    !!typed &&
    !results.isLoading &&
    !pages.some((page) => page.title.toLowerCase() === typed.toLowerCase());

  const link = (title: string, create: boolean) => {
    const label = range.words.toLowerCase() === title.toLowerCase() ? null : range.words;
    editor
      .chain()
      .focus()
      .insertContentAt(range, { type: "wikiLink", attrs: { target: title, label } })
      .run();
    if (create) onCreatePage(title);
    onClose();
  };

  return (
    <Dialog
      title="Link these words to a page"
      icon={<BookOpen className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3"
        data-link-words
        onSubmit={(event) => {
          event.preventDefault();
          const exact = pages.find((page) => page.title.toLowerCase() === typed.toLowerCase());
          if (exact) link(exact.title, false);
          else if (offerNew) link(typed, true);
        }}
      >
        <p className="text-sm text-foreground-light">
          Linking <span className="font-medium text-foreground">“{range.words}”</span> — to a page
          that exists, or a new one named after what you type.
        </p>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a page"
          aria-label="Find a page"
          className="bg-white"
        />
        <ul className="flex max-h-72 flex-col overflow-y-auto" role="listbox" aria-label="Pages">
          {pages.map((found) => (
            <li key={`${found.circleId}:${found.slug}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => link(found.title, false)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{found.title}</span>
                <span className="shrink-0 text-xs text-muted">{found.circleName}</span>
              </button>
            </li>
          ))}
          {offerNew ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                data-new-page
                onClick={() => link(typed, true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">New page “{typed}”</span>
                <span className="shrink-0 text-xs text-muted">{circle.name}</span>
              </button>
            </li>
          ) : null}
          {!pages.length && !offerNew && !results.isLoading ? (
            <li className="px-2 py-1.5 text-sm text-muted">
              {typed ? "No page by that name" : "Type a page's name"}
            </li>
          ) : null}
        </ul>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
