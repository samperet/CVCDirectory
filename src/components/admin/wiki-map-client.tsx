"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { drag } from "d3-drag";
import { ArrowLeft, Crosshair, Network, SlidersHorizontal, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { NOTE_STYLES } from "@/lib/pins/shared";
import type { GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind, WikiGraph } from "@/lib/pins/graph";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const KINDS: { kind: GraphNodeKind; label: string; color: string }[] = [
  { kind: "note", label: "Notes", color: NOTE_STYLES.yellow.swatch },
  { kind: "circle", label: "Circles", color: "#1e4620" },
  { kind: "person", label: "People", color: "#6b8e70" },
  { kind: "task", label: "Tasks", color: "#e8a317" },
  { kind: "document", label: "Documents", color: "#5b7fa6" },
  { kind: "thread", label: "Forum", color: "#9a6fb0" },
  { kind: "community", label: "Community", color: "#c27c0e" },
];
const KIND_COLOR = Object.fromEntries(KINDS.map((entry) => [entry.kind, entry.color])) as Record<GraphNodeKind, string>;

const EDGES: { kind: GraphEdgeKind; label: string; color: string; dash?: string; width: number }[] = [
  { kind: "link", label: "Links", color: "#2f5a32", width: 1.4 },
  { kind: "pin", label: "Pins", color: "#d08f0b", dash: "5 4", width: 1.6 },
  { kind: "belongs", label: "Belongs to circle", color: "#b8c7b9", width: 1 },
];
const EDGE_STYLE = Object.fromEntries(EDGES.map((entry) => [entry.kind, entry])) as Record<GraphEdgeKind, (typeof EDGES)[number]>;

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphEdgeKind };

const radius = (node: GraphNode) => (node.kind === "circle" || node.kind === "community" ? 15 : node.kind === "note" ? 11 : 8);
const short = (text: string, length = 30) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/** The part of the map to show: chosen kinds and edges, around a circle or a focused node. */
function visibleGraph(graph: WikiGraph, kinds: Set<GraphNodeKind>, edgeKinds: Set<GraphEdgeKind>, circle: string, focus: string | null, hops: number) {
  let nodes = graph.nodes.filter((node) => kinds.has(node.kind) || node.id === focus);
  let ids = new Set(nodes.map((node) => node.id));
  let edges = graph.edges.filter((edge) => edgeKinds.has(edge.kind) && ids.has(edge.source) && ids.has(edge.target));
  const neighbours = (seed: Set<string>, steps: number) => {
    const keep = new Set(seed);
    let frontier = new Set(seed);
    for (let step = 0; step < steps; step++) {
      const next = new Set<string>();
      for (const edge of edges) {
        if (frontier.has(edge.source) && !keep.has(edge.target)) next.add(edge.target);
        if (frontier.has(edge.target) && !keep.has(edge.source)) next.add(edge.source);
      }
      next.forEach((id) => keep.add(id));
      frontier = next;
    }
    return keep;
  };
  let keep: Set<string> | null = null;
  if (focus && ids.has(focus)) keep = neighbours(new Set([focus]), hops);
  else if (circle) keep = neighbours(new Set(nodes.filter((node) => node.id === `circle:${circle}` || (node.kind === "note" && node.circleId === circle)).map((node) => node.id)), 1);
  if (keep) {
    nodes = nodes.filter((node) => keep!.has(node.id));
    ids = new Set(nodes.map((node) => node.id));
    edges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  }
  return { nodes, edges };
}

function GraphCanvas({ nodes, edges, focus, onFocus }: { nodes: GraphNode[]; edges: GraphEdge[]; focus: string | null; onFocus: (id: string) => void }) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const fitRef = useRef<() => void>(() => {});

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;
    const width = svgElement.clientWidth || 800;
    const height = svgElement.clientHeight || 600;
    const svg = select(svgElement);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const simNodes: SimNode[] = nodes.map((node) => ({ ...node, ...(positions.current.get(node.id) ?? {}) }));
    const byId = new Map(simNodes.map((node) => [node.id, node]));
    const simLinks: SimLink[] = edges.map((edge) => ({ source: byId.get(edge.source)!, target: byId.get(edge.target)!, kind: edge.kind }));
    const adjacent = new Map<string, Set<string>>();
    for (const edge of edges) {
      adjacent.set(edge.source, (adjacent.get(edge.source) ?? new Set()).add(edge.target));
      adjacent.set(edge.target, (adjacent.get(edge.target) ?? new Set()).add(edge.source));
    }

    const root = svg.append("g");
    const zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (event) => root.attr("transform", event.transform.toString()));
    svg.call(zoomer).on("dblclick.zoom", null);

    const link = root
      .append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d) => EDGE_STYLE[d.kind].color)
      .attr("stroke-width", (d) => EDGE_STYLE[d.kind].width)
      .attr("stroke-dasharray", (d) => EDGE_STYLE[d.kind].dash ?? null)
      .attr("stroke-opacity", 0.8);

    const node = root
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(simNodes, (d) => d.id)
      .join("g")
      .attr("class", "cursor-pointer")
      .attr("tabindex", 0)
      .attr("role", "link")
      .attr("aria-label", (d) => `${d.label} (${d.kind})`);

    node.each(function (d) {
      const group = select(this);
      const r = radius(d);
      const fill = d.kind === "note" ? NOTE_STYLES[d.color ?? "yellow"].swatch : KIND_COLOR[d.kind];
      const stroke = d.id === focus ? "#1e4620" : d.kind === "note" ? NOTE_STYLES[d.color ?? "yellow"].edge : "#ffffff";
      const width = d.id === focus ? 3 : 1.5;
      if (d.kind === "note") {
        group.append("rect").attr("x", -r).attr("y", -r).attr("width", r * 2).attr("height", r * 2).attr("rx", 2).attr("transform", "rotate(-4)").attr("fill", fill).attr("stroke", stroke).attr("stroke-width", width);
      } else if (d.kind === "task") {
        group.append("rect").attr("x", -r).attr("y", -r).attr("width", r * 2).attr("height", r * 2).attr("transform", "rotate(45)").attr("fill", fill).attr("stroke", stroke).attr("stroke-width", width);
      } else if (d.kind === "document") {
        group.append("rect").attr("x", -r * 0.8).attr("y", -r).attr("width", r * 1.6).attr("height", r * 2).attr("rx", 1.5).attr("fill", fill).attr("stroke", stroke).attr("stroke-width", width);
      } else {
        group.append("circle").attr("r", r).attr("fill", fill).attr("stroke", stroke).attr("stroke-width", width);
      }
      group
        .append("text")
        .text(short(d.label))
        .attr("y", r + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", d.kind === "circle" || d.kind === "community" ? 12 : 10.5)
        .attr("font-weight", d.kind === "circle" || d.kind === "community" ? 600 : 400)
        .attr("fill", "#1e4620")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .attr("pointer-events", "none");
      group.append("title").text(d.label);
    });

    // Hover (or focus): light up a node and its neighbours.
    const highlight = (id: string | null) => {
      const near = id ? new Set([id, ...Array.from(adjacent.get(id) ?? [])]) : null;
      node.attr("opacity", (d) => (!near || near.has(d.id) ? 1 : 0.15));
      link.attr("stroke-opacity", (d) => (!id ? 0.8 : (d.source as SimNode).id === id || (d.target as SimNode).id === id ? 1 : 0.06));
    };
    const open = (d: SimNode) => (d.external ? window.open(d.href, "_blank", "noopener") : router.push(d.href));
    node
      .on("mouseenter focus", (_event, d) => highlight(d.id))
      .on("mouseleave blur", () => highlight(null))
      .on("click", (event: MouseEvent, d) => (event.shiftKey || event.altKey ? onFocus(d.id) : open(d)))
      .on("keydown", (event: KeyboardEvent, d) => {
        if (event.key === "Enter") open(d);
        if (event.key === "f") onFocus(d.id);
      });

    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => (d.kind === "belongs" ? 70 : d.kind === "pin" ? 90 : 80))
          .strength((d) => (d.kind === "belongs" ? 0.3 : 0.6))
      )
      .force("charge", forceManyBody<SimNode>().strength((d) => (d.kind === "circle" ? -420 : -200)))
      .force("center", forceCenter(width / 2, height / 2))
      .force("x", forceX<SimNode>(width / 2).strength(0.04))
      .force("y", forceY<SimNode>(height / 2).strength(0.04))
      .force("collide", forceCollide<SimNode>((d) => radius(d) + 14));

    const draw = () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      for (const d of simNodes) positions.current.set(d.id, { x: d.x!, y: d.y! });
    };
    // Settle the layout before showing it, then fit it to the frame.
    simulation.stop();
    simulation.tick(simNodes.some((d) => !positions.current.has(d.id)) ? 300 : 60);
    draw();
    simulation.on("tick", draw);
    const fit = () => {
      if (!simNodes.length) return;
      const xs = simNodes.map((d) => d.x!);
      const ys = simNodes.map((d) => d.y!);
      const [x0, x1, y0, y1] = [Math.min(...xs) - 70, Math.max(...xs) + 70, Math.min(...ys) - 40, Math.max(...ys) + 50];
      const scale = Math.min(1.6, width / (x1 - x0), height / (y1 - y0));
      svg.call(zoomer.transform, zoomIdentity.translate(width / 2 - (scale * (x0 + x1)) / 2, height / 2 - (scale * (y0 + y1)) / 2).scale(scale));
    };
    fitRef.current = fit;
    svg.call(zoomer.transform, zoomIdentity);
    fit();

    node.call(
      drag<SVGGElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, focus, onFocus, router]);

  return (
    <div className="relative">
      <svg ref={svgRef} className="h-[70vh] min-h-[24rem] w-full touch-none font-sans select-none rounded-xl border border-border bg-[#fbfdf9]" role="img" aria-label="Map of notes and how they connect" />
      <button
        type="button"
        onClick={() => fitRef.current()}
        className="absolute bottom-3 right-3 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground shadow-soft hover:bg-accent"
      >
        Reset view
      </button>
    </div>
  );
}

/**
 * The notes map (admins only): every wiki note, its circle, what it links
 * to, and where it's pinned — drawn as a graph that settles itself. Hover to
 * see a note's connections; click to open; shift-click to focus on it.
 */
export function WikiMapClient() {
  const params = useSearchParams();
  const { data, error, isLoading } = useQuery({ queryKey: ["wiki-graph"], queryFn: () => apiFetch<WikiGraph>("/api/admin/wiki-graph") });
  const [kinds, setKinds] = useState<Set<GraphNodeKind>>(() => new Set(KINDS.map((entry) => entry.kind)));
  const [edgeKinds, setEdgeKinds] = useState<Set<GraphEdgeKind>>(() => new Set(EDGES.map((entry) => entry.kind)));
  const [circle, setCircle] = useState(params.get("circle") ?? "");
  const [focus, setFocus] = useState<string | null>(params.get("focus"));
  const [hops, setHops] = useState(1);
  const [find, setFind] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const graph = useMemo(() => (data ? visibleGraph(data, kinds, edgeKinds, circle, focus, hops) : null), [data, kinds, edgeKinds, circle, focus, hops]);
  const focused = data?.nodes.find((node) => node.id === focus);
  const matches = useMemo(() => {
    const wanted = find.trim().toLowerCase();
    return wanted && data ? data.nodes.filter((node) => node.label.toLowerCase().includes(wanted)).slice(0, 8) : [];
  }, [find, data]);
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const onFocus = useMemo(() => (id: string) => setFocus(id), []);

  const check = "flex items-center gap-2 text-sm text-foreground";
  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Network className="h-6 w-6 text-primary" aria-hidden /> Notes map
          </h1>
          <p className="text-sm text-muted">How wiki notes connect: links between them, where they&apos;re pinned, and their circles. Admins only.</p>
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

      <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className={cn("flex-col gap-4 p-4 lg:flex", showFilters ? "flex" : "hidden")}>
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Circle
            <select value={circle} onChange={(event) => setCircle(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-sm">
              <option value="">All circles</option>
              {data?.circles.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          <div className="relative flex flex-col gap-1 text-sm font-medium text-foreground">
            <label htmlFor="map-find">Focus on</label>
            {focused ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-2">
                <p className="flex items-start gap-1.5">
                  <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 break-words">{focused.label}</span>
                  <button type="button" onClick={() => setFocus(null)} className="rounded p-0.5 text-muted hover:text-foreground" aria-label="Stop focusing">
                    <X className="h-4 w-4" />
                  </button>
                </p>
                <div className="flex items-center gap-2 text-xs font-normal text-muted" role="radiogroup" aria-label="How far out">
                  Show
                  {[1, 2].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={hops === value}
                      onClick={() => setHops(value)}
                      className={cn("rounded-full px-2 py-0.5", hops === value ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-accent")}
                    >
                      {value === 1 ? "neighbours" : "2 steps"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <input id="map-find" type="text" inputMode="search" value={find} onChange={(event) => setFind(event.target.value)} placeholder="Find a note, circle, person…" className="h-10 rounded-lg border border-border bg-white px-3 text-sm font-normal" />
                {matches.length ? (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 flex flex-col rounded-lg border border-border bg-surface p-1 shadow-elev">
                    {matches.map((node) => (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setFocus(node.id);
                            setFind("");
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal hover:bg-accent"
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: node.kind === "note" ? NOTE_STYLES[node.color ?? "yellow"].swatch : KIND_COLOR[node.kind] }} aria-hidden />
                          <span className="truncate">{node.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
            <p className="text-xs font-normal text-muted">Or shift-click a node on the map.</p>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium text-foreground">Show</legend>
            {KINDS.map((entry) => (
              <label key={entry.kind} className={check}>
                <input type="checkbox" checked={kinds.has(entry.kind)} onChange={() => setKinds(toggle(kinds, entry.kind))} className="h-4 w-4 accent-[#1e4620]" />
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: entry.color }} aria-hidden /> {entry.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium text-foreground">Connections</legend>
            {EDGES.map((entry) => (
              <label key={entry.kind} className={check}>
                <input type="checkbox" checked={edgeKinds.has(entry.kind)} onChange={() => setEdgeKinds(toggle(edgeKinds, entry.kind))} className="h-4 w-4 accent-[#1e4620]" />
                <svg width="22" height="6" aria-hidden>
                  <line x1="0" y1="3" x2="22" y2="3" stroke={entry.color} strokeWidth={2} strokeDasharray={entry.dash} />
                </svg>
                {entry.label}
              </label>
            ))}
          </fieldset>
          {graph ? (
            <p className="text-xs text-muted">
              {graph.nodes.length} items · {graph.edges.length} connections
            </p>
          ) : null}
        </Card>

        <div className="min-w-0">
          {isLoading ? (
            <p className="text-sm text-muted">Drawing the map…</p>
          ) : error ? (
            <Card>
              <p className="text-sm text-foreground">{(error as Error).message}</p>
            </Card>
          ) : graph && graph.nodes.length ? (
            <GraphCanvas nodes={graph.nodes} edges={graph.edges} focus={focus} onFocus={onFocus} />
          ) : (
            <Card>
              <p className="text-sm text-muted">Nothing to show with these filters.</p>
            </Card>
          )}
          <p className="mt-2 text-xs text-muted">Drag to move things around, scroll or pinch to zoom. Click to open; shift-click to focus.</p>
        </div>
      </div>
    </div>
  );
}
