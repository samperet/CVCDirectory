"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Map as MapIcon, Network, SlidersHorizontal } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { GraphEdgeKind, GraphNode, GraphNodeKind, WikiGraph } from "@/lib/wiki/graph";
import { EDGE_INFO, NodePanel, circleColors, nodeFill } from "@/components/wiki/map-shared";
import { IslandsView, type IslandsHandle } from "@/components/wiki/map-islands";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard } from "@/components/ui/status";
import { SegmentedControl } from "@/components/ui/segmented";

// The 3D view (three.js) loads only when it's chosen.
const Globe3DView = dynamic(
  () => import("@/components/wiki/map-3d").then((module) => module.Globe3DView),
  {
    ssr: false,
    loading: () => <div className="h-[60vh] animate-pulse rounded-2xl bg-[#0f1d18]" />,
  }
);

const KINDS = new Set<GraphNodeKind>(["page"]);

/**
 * The wiki map (opened from the wiki's Map button, for everyone — each sees
 * the pages they can): each circle an island holding its pages, with links
 * between them — or the same in 3D. Hover
 * for a name; click for details and to open it.
 */
export function WikiMapClient() {
  const router = useRouter();
  const params = useSearchParams();
  const islands = useRef<IslandsHandle>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["wiki-graph"],
    queryFn: () => apiFetch<WikiGraph>("/api/wiki/graph"),
  });
  const [view, setView] = useState<"islands" | "3d">("islands");
  const kinds = KINDS;
  const [edgeKinds, setEdgeKinds] = useState<Set<GraphEdgeKind>>(
    () => new Set<GraphEdgeKind>(["link"])
  );
  // The item whose panel is open, and whether its connections are lit.
  const [selected, setSelected] = useState<string | null>(params.get("focus"));
  const [connections, setConnections] = useState(false);
  const [find, setFind] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const colors = useMemo(() => (data ? circleColors(data) : new Map<string, string>()), [data]);

  // Arriving with ?circle= or ?focus=: zoom there once the map is drawn.
  const start =
    params.get("focus") ?? (params.get("circle") ? `circle:${params.get("circle")}` : null);
  useEffect(() => {
    if (!data || !start) return;
    const timer = setTimeout(() => islands.current?.zoomTo(start), 300);
    return () => clearTimeout(timer);
  }, [data, start]);

  const open = (node: GraphNode) => router.push(node.href);
  const select = (id: string | null, zoom = false) => {
    setSelected(id);
    if (!id) setConnections(false);
    if (zoom && view === "islands") islands.current?.zoomTo(id);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const matches = useMemo(() => {
    const wanted = find.trim().toLowerCase();
    return wanted && data
      ? data.nodes.filter((node) => node.label.toLowerCase().includes(wanted)).slice(0, 8)
      : [];
  }, [find, data]);
  const chosen = data?.nodes.find((node) => node.id === selected);
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const counts = useMemo(() => {
    const byCircle = new Map<string, number>();
    for (const node of data?.nodes ?? [])
      if (node.kind === "page" && node.circleId)
        byCircle.set(node.circleId, (byCircle.get(node.circleId) ?? 0) + 1);
    return byCircle;
  }, [data]);

  const check = "flex items-center gap-2 text-sm text-foreground";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionHeading icon={Network}>Map</SectionHeading>
          <p className="text-sm text-muted">
            The wiki&apos;s pages (those you can see) by parent circle, and how they link to each
            other.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            size="sm"
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "islands", label: "Islands", icon: MapIcon },
              { value: "3d", label: "3D", icon: Box },
            ]}
          />
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
                    onClick={() => select(`circle:${circle.id}`, true)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-foreground hover:bg-accent"
                    title={`Show ${circle.name}`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: colors.get(circle.id) }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{circle.name}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {counts.get(circle.id) ?? 0}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="relative flex flex-col gap-1.5">
            <label htmlFor="map-find" className="text-sm font-semibold text-foreground">
              Find
            </label>
            <input
              id="map-find"
              type="text"
              inputMode="search"
              value={find}
              onChange={(event) => setFind(event.target.value)}
              placeholder="A page or circle…"
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            />
            {matches.length ? (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col rounded-lg border border-border bg-surface p-1 shadow-elev">
                {matches.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setFind("");
                        select(node.id, true);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            node.kind === "circle"
                              ? colors.get(node.circleId ?? "")
                              : nodeFill(node),
                        }}
                        aria-hidden
                      />
                      <span className="truncate">{node.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-semibold text-foreground">Connections</legend>
            {(["link"] as const).map((kind) => (
              <label key={kind} className={check}>
                <input
                  type="checkbox"
                  checked={edgeKinds.has(kind)}
                  onChange={() => setEdgeKinds(toggle(edgeKinds, kind))}
                  className="h-4 w-4 accent-[#3f7d5c]"
                />
                <svg width="22" height="6" aria-hidden>
                  <line
                    x1="0"
                    y1="3"
                    x2="22"
                    y2="3"
                    stroke={EDGE_INFO[kind].color}
                    strokeWidth={2}
                    strokeDasharray={EDGE_INFO[kind].dash}
                  />
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
            <ErrorCard error={error} />
          ) : data && data.nodes.length ? (
            <div className="relative">
              {view === "islands" ? (
                <IslandsView
                  ref={islands}
                  graph={data}
                  colors={colors}
                  kinds={kinds}
                  edgeKinds={edgeKinds}
                  selected={selected}
                  connections={connections}
                  onSelect={(id) => select(id)}
                />
              ) : (
                <Globe3DView
                  graph={data}
                  colors={colors}
                  kinds={kinds}
                  edgeKinds={edgeKinds}
                  onSelect={(id) => select(id)}
                />
              )}
              {chosen ? (
                // Docked on the right on wider screens; a sheet along the bottom on phones.
                <div className="absolute inset-x-2 bottom-2 z-20 flex max-h-[60%] flex-col sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-12 sm:max-h-[calc(100%-4rem)] sm:w-80">
                  <NodePanel
                    node={chosen}
                    graph={data}
                    colors={colors}
                    connections={connections}
                    onSelect={(id) => select(id, true)}
                    onOpen={open}
                    onZoom={
                      view === "islands" ? () => islands.current?.zoomTo(chosen.id) : undefined
                    }
                    onToggleConnections={() => setConnections(!connections)}
                    onClose={() => select(null)}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <Card>
              <p className="text-sm text-muted">No wiki pages yet.</p>
            </Card>
          )}
          <p className="mt-2 text-xs text-muted">
            {view === "islands"
              ? "Scroll or pinch to zoom, drag to pan. Hover for a name; click anything for details and to open it."
              : "Drag to turn, scroll to zoom. Hover for a name; click for details."}
          </p>
        </div>
      </div>
    </div>
  );
}
