"use client";

import { BookOpen, CircleDot, FileText, ListChecks, MessagesSquare, User, Users } from "lucide-react";
import { NOTE_STYLES } from "@/lib/pins/shared";
import type { GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind, WikiGraph } from "@/lib/pins/graph";
import { timeAgo } from "@/lib/time";

/** Earthy, harmonious colours for circles — each circle keeps one. */
export const CIRCLE_PALETTE = ["#3f7d5c", "#c4892f", "#4e79a7", "#a05d8c", "#4f9a8f", "#c0634f", "#7568b0", "#8a9a4b", "#b07a55", "#5d8fb8", "#9b6b3d", "#6a8f6b"];

export const KIND_INFO: Record<GraphNodeKind, { label: string; plural: string; icon: typeof BookOpen; color: string }> = {
  note: { label: "Page", plural: "Pages", icon: BookOpen, color: "#e6c457" },
  circle: { label: "Circle", plural: "Circles", icon: CircleDot, color: "#3f7d5c" },
  person: { label: "Person", plural: "People", icon: User, color: "#8c8f86" },
  task: { label: "Task", plural: "Tasks", icon: ListChecks, color: "#d39a3a" },
  document: { label: "Document", plural: "Documents", icon: FileText, color: "#6f8fb3" },
  thread: { label: "Discussion", plural: "Forum", icon: MessagesSquare, color: "#9a77b5" },
  community: { label: "Community dashboard", plural: "Dashboard", icon: Users, color: "#c27c0e" },
};

export const EDGE_INFO: Record<"link" | "pin", { label: string; color: string; dash?: string }> = {
  link: { label: "Links", color: "#5b6b62" },
  pin: { label: "Pins", color: "#c4892f", dash: "4 4" },
};

/** Each circle's colour, by its place in the list (stable as long as circles don't change). */
export function circleColors(graph: WikiGraph) {
  return new Map(graph.circles.map((circle, index) => [circle.id, CIRCLE_PALETTE[index % CIRCLE_PALETTE.length]]));
}

/** A node's fill: a page in its own colour, others by kind. */
export const nodeFill = (node: GraphNode) => (node.kind === "note" ? NOTE_STYLES[node.color ?? "yellow"].swatch : KIND_INFO[node.kind].color);

/** What's connected to what (links and pins only — containment is drawn as nesting). */
export function neighbours(edges: GraphEdge[]) {
  const map = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.kind !== "link" && edge.kind !== "pin") continue;
    map.set(edge.source, (map.get(edge.source) ?? new Set()).add(edge.target));
    map.set(edge.target, (map.get(edge.target) ?? new Set()).add(edge.source));
  }
  return map;
}

/** The hover card: what a node is, where it lives, its opening lines, and what it's tied to. */
export function NodeCard({ node, graph, colors, onOpen }: { node: GraphNode; graph: WikiGraph; colors: Map<string, string>; onOpen?: () => void }) {
  const Info = KIND_INFO[node.kind];
  const label = (id: string) => graph.nodes.find((entry) => entry.id === id)?.label ?? "";
  const circle = graph.circles.find((entry) => entry.id === node.circleId);
  const out = (kind: GraphEdgeKind) => graph.edges.filter((edge) => edge.kind === kind && edge.source === node.id).map((edge) => label(edge.target));
  const into = (kind: GraphEdgeKind) => graph.edges.filter((edge) => edge.kind === kind && edge.target === node.id).map((edge) => label(edge.source));
  const children = graph.nodes.filter((entry) => entry.parent === node.id).map((entry) => entry.label);
  const rows: [string, string[]][] =
    node.kind === "note"
      ? [
          ["Links to", out("link")],
          ["Linked from", into("link")],
          ["Pinned to", out("pin")],
          ["Pages started here", children],
        ]
      : node.kind === "circle"
        ? [["Pages", graph.nodes.filter((entry) => entry.kind === "note" && entry.circleId === node.circleId).map((entry) => entry.label)]]
        : [["Connected pages", [...into("link"), ...into("pin")]]];
  const list = (items: string[]) => (items.length > 4 ? `${items.slice(0, 4).join(", ")} and ${items.length - 4} more` : items.join(", "));
  return (
    <div className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-xl border border-border bg-white/95 p-3 text-sm shadow-elev backdrop-blur">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: node.kind === "circle" ? colors.get(node.circleId ?? "") : nodeFill(node) }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-foreground">{node.label}</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            <Info.icon className="h-3 w-3" aria-hidden />
            {Info.label}
            {circle && node.kind !== "circle" ? (
              <>
                {" · "}
                <span className="font-medium" style={{ color: colors.get(circle.id) }}>
                  {circle.name}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      {node.excerpt ? <p className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-foreground-light">{node.excerpt}</p> : null}
      {rows.some(([, items]) => items.length) ? (
        <dl className="flex flex-col gap-0.5 border-t border-border pt-2 text-xs">
          {rows
            .filter(([, items]) => items.length)
            .map(([title, items]) => (
              <div key={title}>
                <dt className="inline font-medium text-foreground">{title}: </dt>
                <dd className="inline text-foreground-light">{list(items)}</dd>
              </div>
            ))}
        </dl>
      ) : null}
      {node.edited ? (
        <p className="text-[11px] text-muted">
          Edited by {node.edited.by} · {timeAgo(node.edited.at)}
        </p>
      ) : null}
      {onOpen ? (
        <button type="button" onClick={onOpen} className="self-start rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          Open
        </button>
      ) : null}
    </div>
  );
}
