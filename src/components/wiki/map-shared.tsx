"use client";

import { BookOpen, CircleDot, X } from "lucide-react";
import type {
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  WikiGraph,
} from "@/lib/wiki/graph";
import { timeAgo } from "@/lib/time";

/** Earthy, harmonious colours for circles — each circle keeps one. */
export const CIRCLE_PALETTE = [
  "#3f7d5c",
  "#c4892f",
  "#4e79a7",
  "#a05d8c",
  "#4f9a8f",
  "#c0634f",
  "#7568b0",
  "#8a9a4b",
  "#b07a55",
  "#5d8fb8",
  "#9b6b3d",
  "#6a8f6b",
];

export const KIND_INFO: Record<
  GraphNodeKind,
  { label: string; plural: string; icon: typeof BookOpen; color: string }
> = {
  page: { label: "Page", plural: "Pages", icon: BookOpen, color: "#ffffff" },
  circle: { label: "Circle", plural: "Circles", icon: CircleDot, color: "#3f7d5c" },
};

export const EDGE_INFO: Record<"link", { label: string; color: string; dash?: string }> = {
  link: { label: "Links", color: "#5b6b62" },
};

/** Each circle's colour, by its place in the list (stable as long as circles don't change). */
export function circleColors(graph: WikiGraph) {
  return new Map(
    graph.circles.map((circle, index) => [circle.id, CIRCLE_PALETTE[index % CIRCLE_PALETTE.length]])
  );
}

/** A node's fill, by kind (pages are white discs; a page's island is its circle's colour). */
export const nodeFill = (node: GraphNode) => KIND_INFO[node.kind].color;

/** What links to what (a page's circle is drawn as nesting). */
export function neighbours(edges: GraphEdge[]) {
  const map = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.kind !== "link") continue;
    map.set(edge.source, (map.get(edge.source) ?? new Set()).add(edge.target));
    map.set(edge.target, (map.get(edge.target) ?? new Set()).add(edge.source));
  }
  return map;
}

/** On hover: just the name (and, for things in a circle, which one). */
export function NameTip({
  node,
  graph,
  x,
  y,
  bounds,
}: {
  node: GraphNode;
  graph: WikiGraph;
  x: number;
  y: number;
  bounds: { width: number; height: number };
}) {
  const circle =
    node.kind !== "circle" ? graph.circles.find((entry) => entry.id === node.circleId) : undefined;
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-[16rem] truncate rounded-full bg-[#1e2b25]/90 px-3 py-1 text-xs font-medium text-white shadow-elev"
      style={{
        left: Math.min(Math.max(x + 12, 6), bounds.width - 200),
        top: Math.min(Math.max(y + 14, 6), bounds.height - 30),
      }}
      role="tooltip"
    >
      {node.label}
      {circle ? <span className="font-normal text-white/60"> · {circle.name}</span> : null}
    </div>
  );
}

const OPEN_LABEL: Record<GraphNodeKind, string> = {
  page: "Open page",
  circle: "Open circle page",
};

/**
 * What a click on the map shows: what it is, where it lives, its opening
 * lines, what it's tied to (each one clickable, to look at that instead),
 * and what to do with it.
 */
export function NodePanel({
  node,
  graph,
  colors,
  connections,
  onSelect,
  onOpen,
  onZoom,
  onToggleConnections,
  onClose,
}: {
  node: GraphNode;
  graph: WikiGraph;
  colors: Map<string, string>;
  connections: boolean;
  onSelect: (id: string) => void;
  onOpen: (node: GraphNode) => void;
  onZoom?: () => void;
  onToggleConnections: () => void;
  onClose: () => void;
}) {
  const Info = KIND_INFO[node.kind];
  const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]));
  const circle = graph.circles.find((entry) => entry.id === node.circleId);
  const out = (kind: GraphEdgeKind) =>
    graph.edges
      .filter((edge) => edge.kind === kind && edge.source === node.id)
      .map((edge) => edge.target);
  const into = (kind: GraphEdgeKind) =>
    graph.edges
      .filter((edge) => edge.kind === kind && edge.target === node.id)
      .map((edge) => edge.source);
  const rows: [string, string[]][] =
    node.kind === "page"
      ? [
          ["Links to", out("link")],
          ["Linked from", into("link")],
        ]
      : [
          [
            "Pages",
            graph.nodes
              .filter((entry) => entry.kind === "page" && entry.circleId === node.circleId)
              .map((entry) => entry.id),
          ],
        ];
  const action =
    "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition";
  return (
    <div
      className="flex max-h-full flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-white/95 p-4 text-sm shadow-elev backdrop-blur"
      role="dialog"
      aria-label={node.label}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 h-3 w-3 shrink-0 rounded-full border border-black/10"
          style={{
            backgroundColor:
              node.kind === "circle" ? colors.get(node.circleId ?? "") : nodeFill(node),
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-snug text-foreground">{node.label}</p>
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
            <Info.icon className="h-3 w-3" aria-hidden />
            {Info.label}
            {circle && node.kind !== "circle" ? (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => onSelect(`circle:${circle.id}`)}
                  className="font-medium hover:underline"
                  style={{ color: colors.get(circle.id) }}
                >
                  {circle.name}
                </button>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 rounded-md p-1 text-muted hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {node.excerpt ? (
        <p className="line-clamp-6 whitespace-pre-line text-xs leading-relaxed text-foreground-light">
          {node.excerpt}
        </p>
      ) : null}
      {node.edited ? (
        <p className="text-[11px] text-muted">
          Edited by {node.edited.by} · {timeAgo(node.edited.at)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onOpen(node)}
          className={`${action} bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {OPEN_LABEL[node.kind]}
        </button>
        {onZoom ? (
          <button
            type="button"
            onClick={onZoom}
            className={`${action} border border-border bg-white text-foreground hover:bg-accent`}
          >
            Zoom to
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleConnections}
          aria-pressed={connections}
          className={`${action} border ${
            connections
              ? "border-primary bg-accent text-foreground"
              : "border-border bg-white text-foreground hover:bg-accent"
          }`}
        >
          {connections ? "Showing connections" : "Show connections"}
        </button>
      </div>
      {rows.some(([, ids]) => ids.length) ? (
        <dl className="flex flex-col gap-2 border-t border-border pt-3 text-xs">
          {rows
            .filter(([, ids]) => ids.length)
            .map(([title, ids]) => (
              <div key={title} className="flex flex-col gap-1">
                <dt className="font-semibold text-foreground">{title}</dt>
                <dd className="flex flex-wrap gap-1">
                  {ids.map((id) => {
                    const other = byId.get(id);
                    if (!other) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelect(id)}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5 text-foreground hover:bg-accent"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              other.kind === "circle"
                                ? colors.get(other.circleId ?? "")
                                : nodeFill(other),
                          }}
                          aria-hidden
                        />
                        <span className="truncate">{other.label}</span>
                      </button>
                    );
                  })}
                </dd>
              </div>
            ))}
        </dl>
      ) : null}
    </div>
  );
}
