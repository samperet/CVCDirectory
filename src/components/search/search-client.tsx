"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, BookUser, ExternalLink, FileText, Layers, Lightbulb, ListChecks, MessagesSquare, Search, Share2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { SearchGroup, SearchKind } from "@/lib/site-search";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ICONS: Record<SearchKind, typeof Search> = {
  people: BookUser,
  circles: Layers,
  wiki: BookOpen,
  forum: MessagesSquare,
  documents: FileText,
  tasks: ListChecks,
  resources: Lightbulb,
  library: Share2,
};

/** The words to mark in results: the query's terms (quoted phrases kept whole). */
function termsOf(query: string) {
  return Array.from(query.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g), (match) => (match[1] ?? match[2]).trim()).filter(Boolean);
}

/** `text` with each of `terms` marked. */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 ? (
          <mark key={index} className="rounded bg-sun/25 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}

/**
 * Search the whole site: people (by name, bio, and skills), circles, wiki
 * pages, the forum, documents, tasks, resources, and the loan library. The
 * query lives in the address (`?q=`), so a search can be shared or returned
 * to; `&kind=` shows every match of one kind.
 */
export function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const kind = (params.get("kind") as SearchKind | null) ?? null;
  const [text, setText] = useState(q);
  const input = useRef<HTMLInputElement>(null);

  // Ready to type as soon as the page opens (also after arriving from the header's button or "/").
  useEffect(() => input.current?.focus(), []);

  // Follow the address (back and forward), and search a moment after typing stops.
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    const timer = setTimeout(() => router.replace(next ? `/search?${new URLSearchParams({ q: next })}` : "/search"), 350);
    return () => clearTimeout(timer);
  }, [text, q, router]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["search", q, kind],
    queryFn: () => apiFetch<{ groups: SearchGroup[] }>(`/api/search?${new URLSearchParams({ q, ...(kind ? { kind } : {}) })}`),
    enabled: q.length >= 2,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
  const groups = q.length >= 2 ? data?.groups ?? [] : [];
  const terms = termsOf(q);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const next = text.trim();
          router.replace(next ? `/search?${new URLSearchParams({ q: next })}` : "/search");
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          ref={input}
          autoFocus
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search people, skills, circles, wiki, forum, documents…"
          className="h-14 rounded-2xl bg-white pl-12 pr-12 text-base shadow-soft"
          aria-label="Search the site"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText("");
              input.current?.focus();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-accent hover:text-foreground"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </form>

      {kind && q ? (
        <Link href={`/search?${new URLSearchParams({ q })}`} className="-mt-2 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All results
        </Link>
      ) : null}

      {q.length < 2 ? (
        <p className="text-center text-sm text-muted">Type a name, a skill (“plumbing”, “Spanish”), or anything you remember from a page or post.</p>
      ) : error ? (
        <p className="text-sm text-foreground">{(error as Error).message}</p>
      ) : !data && isFetching ? (
        <p className="text-sm text-muted">Searching…</p>
      ) : !groups.length ? (
        <p className="text-center text-sm text-muted">Nothing matches “{q}”.</p>
      ) : (
        <div className={cn("flex flex-col gap-8 transition-opacity", isFetching && "opacity-60")}>
          {groups.map((group) => {
            const Icon = ICONS[group.kind];
            return (
              <section key={group.kind} aria-labelledby={`results-${group.kind}`} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
                  <h2 id={`results-${group.kind}`} className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Icon className="h-5 w-5 text-primary" aria-hidden /> {group.label}
                  </h2>
                  {!kind && group.total > group.results.length ? (
                    <Link href={`/search?${new URLSearchParams({ q, kind: group.kind })}`} className="text-sm font-medium text-secondary-foreground hover:underline">
                      See all {group.total}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">{group.total}</span>
                  )}
                </div>
                <ul className="flex flex-col">
                  {group.results.map((result) => {
                    // A document opens its file in a new tab (a plain link, so it's never prefetched).
                    const Anchor = result.external ? "a" : Link;
                    return (
                    <li key={result.href + result.title}>
                      <Anchor
                        href={result.href}
                        {...(result.external ? { target: "_blank", rel: "noopener" } : {})}
                        className="group -mx-3 flex flex-col gap-0.5 rounded-xl px-3 py-2.5 transition hover:bg-accent/70"
                      >
                        <span className="flex items-center gap-1.5 font-medium text-foreground group-hover:underline">
                          <Marked text={result.title} terms={terms} />
                          {result.external ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="(opens in a new tab)" /> : null}
                        </span>
                        {result.meta ? (
                          <span className="text-xs text-muted">
                            <Marked text={result.meta} terms={terms} />
                          </span>
                        ) : null}
                        {result.snippet ? (
                          <span className="line-clamp-2 text-sm text-foreground-light">
                            <Marked text={result.snippet} terms={terms} />
                          </span>
                        ) : null}
                      </Anchor>
                    </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
