"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import { hierarchy, pack, type HierarchyCircularNode } from "d3-hierarchy";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { PAGE_STYLES } from "@/lib/wiki/colors";
import type { GraphEdgeKind, GraphNode, GraphNodeKind, WikiGraph } from "@/lib/wiki/graph";
import { EDGE_INFO, NameTip, neighbours, nodeFill } from "@/components/wiki/map-shared";

/**
 * The wiki as islands: each circle a soft disc holding the pages it keeps;
 * links arc between them. Hover for a card;
 * click a page to open it, a circle to zoom in.
 */

interface Item {
  id: string;
  kind: "root" | "circle" | "leaf" | "elsewhere";
  node?: GraphNode;
  circleId?: string;
  label: string;
  value?: number;
  children?: Item[];
}

export interface IslandsHandle {
  zoomTo: (id: string | null) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const IslandsView = forwardRef<
  IslandsHandle,
  {
    graph: WikiGraph;
    colors: Map<string, string>;
    kinds: Set<GraphNodeKind>;
    edgeKinds: Set<GraphEdgeKind>;
    /** The item whose panel is open. */
    selected: string | null;
    /** Light up the selected item's connections and fade the rest. */
    connections: boolean;
    onSelect: (id: string | null) => void;
  }
>(function IslandsView({ graph, colors, kinds, edgeKinds, selected, connections, onSelect }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomer = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () =>
      setSize({
        width: element.clientWidth,
        height: Math.max(420, Math.min(window.innerHeight * 0.72, element.clientWidth * 1.1)),
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const degree = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of graph.edges) {
      if (edge.kind !== "link") continue;
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
    return counts;
  }, [graph]);

  // Circles → the pages they keep.
  const packed = useMemo(() => {
    const shown = graph.nodes.filter((node) => node.kind !== "circle" && kinds.has(node.kind));
    const leafValue = (node: GraphNode) => 1 + Math.min(degree.get(node.id) ?? 0, 8) * 0.5;
    const itemFor = (node: GraphNode): Item => ({
      id: node.id,
      kind: "leaf",
      node,
      circleId: node.circleId,
      label: node.label,
      value: leafValue(node),
    });
    const circles: Item[] = graph.circles
      .map((circle) => ({
        id: `circle:${circle.id}`,
        kind: "circle" as const,
        circleId: circle.id,
        label: circle.name,
        node: graph.nodes.find((node) => node.id === `circle:${circle.id}`),
        children: shown.filter((node) => node.circleId === circle.id).map(itemFor),
      }))
      .filter((circle) => circle.children.length);
    const placed = new Set(
      circles.flatMap((circle) => (circle.children ?? []).map((child) => child.id))
    );
    const elsewhere = shown.filter(
      (node) =>
        !placed.has(node.id) &&
        !(node.kind === "page" && circles.some((circle) => circle.circleId === node.circleId))
    );
    const root: Item = {
      id: "root",
      kind: "root",
      label: "",
      children: [
        ...circles,
        ...(elsewhere.length
          ? [
              {
                id: "elsewhere",
                kind: "elsewhere" as const,
                label: "People & places",
                children: elsewhere.map(itemFor),
              },
            ]
          : []),
      ],
    };
    const side = Math.max(200, Math.min(size.width, size.height) - 48);
    const layout = pack<Item>()
      .size([side, side])
      .padding((node) =>
        node.depth === 0
          ? 36
          : node.data.kind === "circle" || node.data.kind === "elsewhere"
            ? 12
            : 4
      )(
      hierarchy(root)
        .sum((item) => item.value ?? 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    );
    const offset = { x: (size.width - side) / 2, y: (size.height - side) / 2 };
    const all = layout
      .descendants()
      .map((node) => Object.assign(node, { x: node.x + offset.x, y: node.y + offset.y }));
    // Where each graph node sits.
    const at = new Map<string, HierarchyCircularNode<Item>>();
    for (const node of all) if (node.data.node) at.set(node.data.node.id, node);
    for (const node of all) if (node.data.kind === "circle") at.set(node.data.id, node);
    return { all, at };
  }, [graph, kinds, degree, size]);

  const links = useMemo(
    () => neighbours(graph.edges.filter((edge) => edgeKinds.has(edge.kind))),
    [graph, edgeKinds]
  );
  // Hovering lights an item's links; "Show connections" also fades everything else.
  const active = hover?.id ?? selected;
  const near =
    connections && selected ? new Set([selected, ...Array.from(links.get(selected) ?? [])]) : null;
  const dim = (id: string) => !!near && !near.has(id);

  // Zooming and panning; zoomTo eases to a circle or node (null: everything).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 12])
      .on("zoom", (event) => setTransform(event.transform));
    select(svg).call(behaviour).on("dblclick.zoom", null);
    zoomer.current = behaviour;
  }, []);
  const animateTo = useCallback(
    (target: ZoomTransform) => {
      const svg = svgRef.current;
      const behaviour = zoomer.current;
      if (!svg || !behaviour) return;
      const start = transform;
      const began = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - began) / 450);
        const ease = 1 - Math.pow(1 - t, 3);
        const k = start.k + (target.k - start.k) * ease;
        const x = start.x + (target.x - start.x) * ease;
        const y = start.y + (target.y - start.y) * ease;
        select(svg).call(behaviour.transform, zoomIdentity.translate(x, y).scale(k));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [transform]
  );
  const zoomTo = useCallback(
    (id: string | null) => {
      const node = id ? packed.at.get(id) : null;
      if (!node) return animateTo(zoomIdentity);
      const k = clamp(Math.min(size.width, size.height) / (node.r * 2.4), 1, 10);
      animateTo(
        zoomIdentity.translate(size.width / 2 - k * node.x, size.height / 2 - k * node.y).scale(k)
      );
    },
    [packed, size, animateTo]
  );
  useImperativeHandle(ref, () => ({ zoomTo }), [zoomTo]);

  const k = transform.k;
  const hoveredNode = hover ? graph.nodes.find((node) => node.id === hover.id) : null;
  const show = (event: React.PointerEvent | React.MouseEvent, id: string) => {
    const rect = box.current!.getBoundingClientRect();
    setHover({ id, x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  // A click selects (opening its panel); a circle also zooms in.
  const choose = (event: React.MouseEvent, node: GraphNode | undefined, item: Item) => {
    event.stopPropagation();
    if (item.kind === "elsewhere") return zoomTo(null);
    if (item.kind === "circle") {
      if (node) onSelect(node.id);
      return zoomTo(item.id);
    }
    if (node) onSelect(node.id);
  };

  const edgePath = (a: HierarchyCircularNode<Item>, b: HierarchyCircularNode<Item>) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return `M${a.x},${a.y} Q${mx - dy * 0.18},${my + dx * 0.18} ${b.x},${b.y}`;
  };

  return (
    <div
      ref={box}
      className="relative overflow-hidden rounded-2xl border border-border bg-[radial-gradient(ellipse_at_top,#fbfdf8,#eef3ec)]"
      onPointerLeave={() => setHover(null)}
    >
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className="block touch-none select-none font-sans"
        role="img"
        aria-label="Map of wiki pages by circle"
        onClick={() => onSelect(null)}
      >
        <defs>
          <filter id="island-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#1e4620" floodOpacity="0.08" />
          </filter>
        </defs>
        <g transform={transform.toString()}>
          {/* Islands: each circle, holding the pages it keeps. */}
          {packed.all
            .filter((node) => node.data.kind === "circle" || node.data.kind === "elsewhere")
            .map((node) => {
              const item = node.data;
              const hue =
                item.kind === "elsewhere"
                  ? "#8c8f86"
                  : colors.get(item.circleId ?? "") ?? "#6b8e70";
              const faded = item.node && dim(item.node.id);
              return (
                <g
                  key={item.id}
                  opacity={faded ? 0.35 : 1}
                  className="cursor-pointer"
                  onClick={(event) => choose(event, item.node, item)}
                  onPointerMove={(event) => item.node && show(event, item.node.id)}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill={hue}
                    fillOpacity={0.09}
                    stroke={hue}
                    strokeOpacity={0.35}
                    strokeWidth={1.5 / k}
                    filter="url(#island-shadow)"
                  />
                  {/* A circle's name sits just above its island. */}
                  <text
                    x={node.x}
                    y={node.y - node.r - 6 / k}
                    textAnchor="middle"
                    fontSize={clamp(node.r * 0.11, 9, 26)}
                    fontWeight={700}
                    fill={hue}
                    stroke="#ffffff"
                    strokeWidth={3 / k}
                    paintOrder="stroke"
                    pointerEvents="none"
                  >
                    {item.label}
                  </text>
                </g>
              );
            })}

          {/* Links, arcing between pages. */}
          <g fill="none" pointerEvents="none">
            {graph.edges
              .filter((edge) => edge.kind === "link" && edgeKinds.has(edge.kind))
              .map((edge) => {
                const a = packed.at.get(edge.source);
                const b = packed.at.get(edge.target);
                if (
                  !a ||
                  !b ||
                  a.data.kind !== "leaf" ||
                  (b.data.kind !== "leaf" && b.data.kind !== "circle")
                )
                  return null;
                const lit = !!active && (edge.source === active || edge.target === active);
                const style = EDGE_INFO.link;
                return (
                  <path
                    key={`${edge.source}|${edge.target}|${edge.kind}`}
                    d={edgePath(a, b)}
                    stroke={lit ? "#2f5a32" : style.color}
                    strokeOpacity={active ? (lit ? 0.9 : 0.05) : 0.16}
                    strokeWidth={(lit ? 2 : 1.2) / k}
                    strokeDasharray={
                      style.dash
                        ? style.dash
                            .split(" ")
                            .map((v) => Number(v) / k)
                            .join(" ")
                        : undefined
                    }
                  />
                );
              })}
          </g>

          {/* Pages (and the dashboard). */}
          {packed.all
            .filter((node) => node.data.kind === "leaf")
            .map((node) => {
              const item = node.data;
              const gnode = item.node!;
              const hue = colors.get(item.circleId ?? "") ?? "#8c8f86";
              const r = node.r * 0.92;
              const faded = dim(gnode.id);
              const lit = selected === gnode.id || hover?.id === gnode.id;
              const square = false;
              return (
                <g
                  key={item.id}
                  className="cursor-pointer"
                  opacity={faded ? 0.25 : 1}
                  onPointerMove={(event) => show(event, gnode.id)}
                  onClick={(event) => choose(event, gnode, item)}
                >
                  {square ? (
                    <rect
                      x={node.x - r * 0.8}
                      y={node.y - r * 0.8}
                      width={r * 1.6}
                      height={r * 1.6}
                      rx={r * 0.3}
                      fill={nodeFill(gnode)}
                      stroke={lit ? "#1e4620" : "#ffffff"}
                      strokeWidth={(lit ? 2.5 : 1.5) / k}
                    />
                  ) : (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={nodeFill(gnode)}
                      stroke={lit ? "#1e4620" : gnode.kind === "page" ? hue : "#ffffff"}
                      strokeOpacity={lit ? 1 : 0.7}
                      strokeWidth={(lit ? 2.5 : 1.5) / k}
                    />
                  )}
                  {(() => {
                    // Inside the node when it fits and is legible; otherwise beneath it, once zoomed in enough.
                    const text =
                      item.label.length > 26 ? `${item.label.slice(0, 25)}…` : item.label;
                    const size = clamp(r * 0.28, 2.5, 11);
                    const inside = text.length * size * 0.56 <= r * 1.7 && !square;
                    if (inside ? size * k < 7 : r * k < 30) return null;
                    return (
                      <text
                        x={node.x}
                        y={inside ? node.y + size * 0.35 : node.y + r + size * 1.15}
                        textAnchor="middle"
                        fontSize={inside ? size : clamp(size * 0.9, 2.5, 10)}
                        fontWeight={inside ? 600 : 500}
                        fill="#1e4620"
                        stroke={inside ? "none" : "#ffffff"}
                        strokeWidth={2.5 / k}
                        paintOrder="stroke"
                        pointerEvents="none"
                      >
                        {text}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
        </g>
      </svg>

      <div className="pointer-events-none absolute right-3 top-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => zoomTo(null)}
          className="pointer-events-auto rounded-full border border-border bg-white/90 px-3 py-1 text-xs font-medium text-foreground shadow-soft hover:bg-accent"
        >
          Whole map
        </button>
      </div>

      {hoveredNode && hover ? (
        <NameTip node={hoveredNode} graph={graph} x={hover.x} y={hover.y} bounds={size} />
      ) : null}
    </div>
  );
});
