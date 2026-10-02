"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { SearchGroup, SearchResult } from "@/lib/site-search";
import { cn } from "@/lib/utils";
import { ResultBody, SEARCH_ICONS, termsOf } from "@/components/search/results";

/**
 * The header's search: a large bar in the middle of the screen, over a
 * dimmed page, with results as you type (a moment after typing stops, from
 * two letters), grouped by kind. ↑ and ↓ choose a result, Enter opens it (or,
 * with none chosen, the full results page), Escape or a click outside closes
 * it. Opened by the magnifying glass, "/", or Ctrl+K (⌘K).
 */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => setActive(-1), [q]);

  // Escape closes it wherever the focus is (a page's own search box can take it back).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The page behind stays put while searching.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const searching = q.length >= 2;
  const { data, isFetching, error } = useQuery({
    queryKey: ["search-live", q],
    queryFn: () => apiFetch<{ groups: SearchGroup[] }>(`/api/search?${new URLSearchParams({ q })}`),
    enabled: searching,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
  const groups = useMemo(() => (searching ? data?.groups ?? [] : []), [searching, data]);
  const results = useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const terms = termsOf(q);
  // The results, then "See all results": the choices ↑ and ↓ move through.
  const choices = results.length + (searching ? 1 : 0);

  const seeAll = () => {
    onClose();
    router.push(`/search?${new URLSearchParams({ q: text.trim() || q })}`);
  };
  const open = (result: SearchResult) => {
    onClose();
    if (result.external) window.open(result.href, "_blank", "noopener");
    else router.push(result.href);
  };
  const choose = (index: number) => (index < results.length ? open(results[index]) : seeAll());

  useEffect(() => {
    if (active < 0) return;
    list.current?.querySelector(`[data-choice="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && choices) {
      event.preventDefault();
      setActive((index) => (index + 1) % choices);
    } else if (event.key === "ArrowUp" && choices) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? choices - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0) choose(active);
      else if (text.trim()) seeAll();
    }
  };

  let index = -1;
  const optionId = (n: number) => `search-choice-${n}`;
  return (
    <div
      className="fixed inset-0 z-[70] flex justify-center bg-foreground/30 px-4 pt-4 backdrop-blur-sm sm:pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="flex h-fit max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-elev sm:max-h-[76vh]"
        data-search-palette
      >
        <div className="relative shrink-0 border-b border-border">
          <Search
            className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search everything…"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={searching}
            aria-controls="search-choices"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-label="Search everything"
            className="h-14 w-full bg-transparent pl-14 pr-24 text-lg text-foreground placeholder:text-muted focus:outline-none"
          />
          <span className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Searching" />
            ) : null}
            <kbd className="hidden rounded-md border border-border bg-white px-1.5 py-0.5 text-xs text-muted sm:inline">
              Esc
            </kbd>
          </span>
        </div>

        <div
          ref={list}
          id="search-choices"
          role="listbox"
          aria-label="Results"
          className="overflow-y-auto"
        >
          {!searching ? (
            <p className="px-5 py-4 text-sm text-muted">
              Search people and their skills, circles, pages and files, the forum, tasks, resources,
              and the loan library.
            </p>
          ) : error ? (
            <p className="px-5 py-4 text-sm text-foreground">{(error as Error).message}</p>
          ) : !data ? (
            <p className="px-5 py-4 text-sm text-muted">Searching…</p>
          ) : (
            <div
              className={cn("flex flex-col py-2 transition-opacity", isFetching && "opacity-70")}
            >
              {!groups.length ? (
                <p className="px-5 py-3 text-sm text-muted">Nothing matches “{q}”.</p>
              ) : (
                groups.map((group) => {
                  const Icon = SEARCH_ICONS[group.kind];
                  return (
                    <section key={group.kind} aria-label={group.label} className="py-1">
                      <h2 className="flex items-center gap-2 px-5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden /> {group.label}
                        {group.total > group.results.length ? (
                          <span className="font-normal normal-case tracking-normal">
                            · {group.results.length} of {group.total}
                          </span>
                        ) : null}
                      </h2>
                      {group.results.map((result) => {
                        index += 1;
                        const n = index;
                        return (
                          <div
                            key={result.href + result.title}
                            id={optionId(n)}
                            role="option"
                            aria-selected={active === n}
                            data-choice={n}
                            onMouseMove={() => active !== n && setActive(n)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => choose(n)}
                            className={cn(
                              "group mx-2 flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2",
                              active === n && "bg-accent"
                            )}
                          >
                            <ResultBody result={result} terms={terms} snippetLines={1} />
                          </div>
                        );
                      })}
                    </section>
                  );
                })
              )}
              <div
                id={optionId(results.length)}
                role="option"
                aria-selected={active === results.length}
                data-choice={results.length}
                onMouseMove={() => active !== results.length && setActive(results.length)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={seeAll}
                className={cn(
                  "mx-2 mt-1 flex cursor-pointer items-center gap-2 rounded-xl border-t border-border px-3 py-2.5 text-sm font-medium text-secondary-foreground",
                  active === results.length && "bg-accent"
                )}
              >
                See all results for “{q}” <ArrowRight className="h-4 w-4" aria-hidden />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
