"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Box, Crosshair, Map as MapIcon, Network, SlidersHorizontal, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { GraphEdgeKind, GraphNode, GraphNodeKind, WikiGraph } from "@/lib/pins/graph";
import { EDGE_INFO, KIND_INFO, circleColors, nodeFill } from "@/components/admin/wiki-map-shared";
import { IslandsView, type IslandsHandle } from "@/components/admin/wiki-map-islands";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The 3D view (three.js) loads only when it's chosen.
const Globe3DView = dynamic(() => import("@/components/admin/wiki-map-3d").then((module) => module.Globe3DView), {
  ssr: false,
  loading: () => <div className="h-[60vh] animate-pulse rounded-2xl bg-[#0f1d18]" />,
});

const KIND_ORDER: GraphNodeKind[] = ["note", "document", "task", "person", "thread", "community"];

/**
 * The wiki map (admins only): each circle an island holding its pages,
 * documents, and tasks, with links and pins between them — or the same in
 * 3D. Hover for a card about anything; click to open it.
 */
export function WikiMapClient() {
  const router = useRouter();
  const params = useSearchParams();
  const islands = useRef<IslandsHandle>(null);
  const { data, error, isLoading } = useQuery({ queryKey: ["wiki-graph"], queryFn: () => apiFetch<WikiGraph>("/api/admin/wiki-graph") });
  const [view, setView] = useState<"islands" | "3d">("islands");
  const [kinds, setKinds] = useState<Set<GraphNodeKind>>(() => new Set(KIND_ORDER));
  const [edgeKinds, setEdgeKinds] = useState<Set<GraphEdgeKind>>(() => new Set<GraphEdgeKind>(["link", "pin"]));
  const [focus, setFocus] = useState<string | null>(params.get("focus"));
  const [find, setFind] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const colors = useMemo(() => (data ? circleColors(data) : new Map<string, string>()), [data]);

  // Arriving with ?circle= or ?focus=: zoom there once the map is drawn.
  const start = params.get("focus") ?? (params.get("circle") ? `circle:${params.get("circle")}` : null);
  useEffect(() => {
    if (!data || !start) return;
    const timer = setTimeout(() => islands.current?.zoomTo(start), 300);
    return () => clearTimeout(timer);
  }, [data, start]);

  const open = (node: GraphNode) => (node.external ? window.open(node.href, "_blank", "noopener") : router.push(node.href));
  const focusOn = (id: string | null) => {
    setFocus(id);
    setFind("");
    if (view === "islands") islands.current?.zoomTo(id);
  };
  const matches = useMemo(() => {
    const wanted = find.trim().toLowerCase();
    return wanted && data ? data.nodes.filter((node) => node.label.toLowerCase().includes(wanted)).slice(0, 8) : [];
  }, [find, data]);
  const focused = data?.nodes.find((node) => node.id === focus);
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const counts = useMemo(() => {
    const byCircle = new Map<string, number>();
    for (const node of data?.nodes ?? []) if (node.kind === "note" && node.circleId) byCircle.set(node.circleId, (byCircle.get(node.circleId) ?? 0) + 1);
    return byCircle;
  }, [data]);

  const check = "flex items-center gap-2 text-sm text-foreground";
  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Network className="h-6 w-6 text-primary" aria-hidden /> Wiki map
          </h1>
          <p className="text-sm text-muted">Each circle&apos;s pages, documents, and tasks, and how they link and pin to each other. Admins only.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-border bg-surface p-0.5 text-sm" role="radiogroup" aria-label="View">
            {(
              [
                ["islands", "Islands", MapIcon],
                ["3d", "3D", Box],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={view === value}
                onClick={() => setView(value)}
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition", view === value ? "bg-primary text-primary-foreground shadow-soft" : "text-muted hover:text-foreground")}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent lg:hidden"
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className={cn("flex-col gap-5 p-4 lg:flex", showFilters ? "flex" : "hidden")}>
          <section className="flex flex-col gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">Circles</h2>
            <ul className="flex flex-col">
              {data?.circles.map((circle) => (
                <li key={circle.id}>
                  <button
                    type="button"
                    onClick={() => (view === "islands" ? islands.current?.zoomTo(`circle:${circle.id}`) : undefined)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-foreground hover:bg-accent"
                    title={view === "islands" ? `Zoom to ${circle.name}` : undefined}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors.get(circle.id) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{circle.name}</span>
                    <span className="text-xs tabular-nums text-muted">{counts.get(circle.id) ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="relative flex flex-col gap-1.5">
            <label htmlFor="map-find" className="text-sm font-semibold text-foreground">
              Find
            </label>
            {focused ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-border bg-accent/40 p-2 text-sm">
                <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 break-words">{focused.label}</span>
                <button type="button" onClick={() => focusOn(null)} className="rounded p-0.5 text-muted hover:text-foreground" aria-label="Clear">
                  <X className="h-4 w-4" />
                </button>
              </p>
            ) : (
              <>
                <input id="map-find" type="text" inputMode="search" value={find} onChange={(event) => setFind(event.target.value)} placeholder="A page, circle, person…" className="h-10 rounded-lg border border-border bg-white px-3 text-sm" />
                {matches.length ? (
                  <ul className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col rounded-lg border border-border bg-surface p-1 shadow-elev">
                    {matches.map((node) => (
                      <li key={node.id}>
                        <button type="button" onClick={() => focusOn(node.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: node.kind === "circle" ? colors.get(node.circleId ?? "") : nodeFill(node) }} aria-hidden />
                          <span className="truncate">{node.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-semibold text-foreground">Show</legend>
            {KIND_ORDER.map((kind) => (
              <label key={kind} className={check}>
                <input type="checkbox" checked={kinds.has(kind)} onChange={() => setKinds(toggle(kinds, kind))} className="h-4 w-4 accent-[#3f7d5c]" />
                <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: KIND_INFO[kind].color }} aria-hidden /> {KIND_INFO[kind].plural}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-semibold text-foreground">Connections</legend>
            {(["link", "pin"] as const).map((kind) => (
              <label key={kind} className={check}>
                <input type="checkbox" checked={edgeKinds.has(kind)} onChange={() => setEdgeKinds(toggle(edgeKinds, kind))} className="h-4 w-4 accent-[#3f7d5c]" />
                <svg width="22" height="6" aria-hidden>
                  <line x1="0" y1="3" x2="22" y2="3" stroke={EDGE_INFO[kind].color} strokeWidth={2} strokeDasharray={EDGE_INFO[kind].dash} />
                </svg>
                {EDGE_INFO[kind].label}
              </label>
            ))}
          </fieldset>
        </Card>

        <div className="min-w-0">
          {isLoading ? (
            <p className="text-sm text-muted">Drawing the map…</p>
          ) : error ? (
            <Card>
              <p className="text-sm text-foreground">{(error as Error).message}</p>
            </Card>
          ) : data && data.nodes.length ? (
            view === "islands" ? (
              <IslandsView ref={islands} graph={data} colors={colors} kinds={kinds} edgeKinds={edgeKinds} focus={focus} onOpen={open} />
            ) : (
              <Globe3DView graph={data} colors={colors} kinds={kinds} edgeKinds={edgeKinds} onOpen={open} />
            )
          ) : (
            <Card>
              <p className="text-sm text-muted">No wiki pages yet.</p>
            </Card>
          )}
          <p className="mt-2 text-xs text-muted">
            {view === "islands" ? "Scroll or pinch to zoom, drag to pan. Click a circle to zoom in; click a page to open it (tap shows its card on phones)." : "Drag to turn, scroll to zoom, click to open."}
          </p>
        </div>
      </div>
    </div>
  );
}
