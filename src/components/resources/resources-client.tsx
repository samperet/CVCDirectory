"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Recommendation, ResourceComment, ResourceLike } from "@/lib/resources/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionArt } from "@/components/layout/section-art";
import { categorySlug } from "@/lib/resources/slug";
import { ErrorCard, Loading } from "@/components/ui/status";
import { KEY, ListResponse } from "@/components/resources/resources-data";
import { RecommendationForm } from "@/components/resources/recommendation-form";
import { RecommendationCard } from "@/components/resources/recommendation-card";

/** Recommenders' photos, from the directory the app has usually loaded already. */
function useRecommenderPhotos() {
  const { data } = useQuery({
    queryKey: ["directory"],
    queryFn: () =>
      apiFetch<{ people: { id: string; photoUrl?: string | null }[] }>("/api/directory"),
    staleTime: 5 * 60_000,
  });
  const photos = useMemo(
    () => new Map((data?.people ?? []).map((person) => [person.id, person.photoUrl ?? null])),
    [data]
  );
  return (personId: string | null) => (personId ? photos.get(personId) ?? null : null);
}

const plural = (count: number) => `${count} recommendation${count === 1 ? "" : "s"}`;

/**
 * Resources. The main page lists the categories (searching shows matching
 * recommendations from every category); a category's page lists its
 * recommendations, with likes and comments.
 */
export function ResourcesClient({ category: slug }: { category?: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const photoFor = useRecommenderPhotos();

  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<ListResponse>("/api/resources"),
  });
  const items = useMemo(() => data?.recommendations ?? [], [data]);
  const groups = useMemo(() => {
    const byCategory = new Map<string, Recommendation[]>();
    for (const item of items)
      byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    return Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const categories = groups.map(([name]) => name);
  const current = slug ? groups.find(([name]) => categorySlug(name) === slug) : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((item) =>
        [item.category, item.title, item.body, item.submittedBy.name].some((text) =>
          text.toLowerCase().includes(q)
        )
      )
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [items, query]);

  const status = isLoading ? (
    <Loading>Loading recommendations…</Loading>
  ) : error ? (
    <ErrorCard error={error} />
  ) : null;

  const addButton = !adding ? (
    <Button className="gap-1.5" onClick={() => setAdding(true)}>
      <Plus className="h-4 w-4" /> Recommend someone
    </Button>
  ) : null;
  const addForm = adding ? (
    <Card>
      <RecommendationForm
        categories={categories}
        defaultCategory={current?.[0] ?? ""}
        onDone={() => setAdding(false)}
        onCreated={(created) => {
          if (categorySlug(created.category) !== slug)
            router.push(`/resources/${categorySlug(created.category)}`);
        }}
      />
    </Card>
  ) : null;

  // A category's page: its recommendations.
  if (slug) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/resources"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All categories
        </Link>
        {status ??
          (current ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-foreground">{current[0]}</h1>
                  <p className="text-sm text-muted">{plural(current[1].length)} from neighbors</p>
                </div>
                {addButton}
              </div>
              {addForm}
              <div className="grid items-start gap-3 md:grid-cols-2">
                {current[1].map((item) => (
                  <RecommendationCard
                    key={item.id}
                    item={item}
                    photoFor={photoFor}
                    categories={categories}
                  />
                ))}
              </div>
            </>
          ) : (
            <Card className="flex flex-col gap-2">
              <p className="text-sm text-foreground">
                There are no recommendations in that category.
              </p>
              <Link
                href="/resources"
                className="text-sm font-medium text-secondary-foreground underline underline-offset-4"
              >
                See all categories
              </Link>
            </Card>
          ))}
      </div>
    );
  }

  // The main page: categories, or matching recommendations while searching.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionArt href="/resources" size={48} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Resources</h1>
          </div>
        </div>
        {addButton}
      </div>
      {addForm}

      <div className="relative sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          placeholder="Search services, names, or notes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="bg-white pl-9"
          aria-label="Search resources"
        />
      </div>

      {status ??
        (query.trim() ? (
          matches.length ? (
            <div className="grid items-start gap-3 md:grid-cols-2">
              {matches.map((item) => (
                <div key={item.id} className="flex flex-col gap-1.5">
                  <Link
                    href={`/resources/${categorySlug(item.category)}`}
                    className="w-fit text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground"
                  >
                    {item.category}
                  </Link>
                  <RecommendationCard item={item} photoFor={photoFor} categories={categories} />
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <p className="text-sm text-muted">No recommendations match “{query.trim()}”.</p>
            </Card>
          )
        ) : groups.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(([name, entries]) => (
              <li key={name}>
                <Link
                  href={`/resources/${categorySlug(name)}`}
                  className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-background p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary hover:bg-accent hover:shadow-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-foreground">{name}</h2>
                    <p className="text-xs text-muted">{plural(entries.length)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <p className="text-sm text-muted">
              No recommendations yet — be the first to recommend someone.
            </p>
          </Card>
        ))}
    </div>
  );
}
