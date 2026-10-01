"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphEdgeKind, GraphNode, GraphNodeKind, WikiGraph } from "@/lib/pins/graph";
import { NameTip, nodeFill } from "@/components/admin/wiki-map-shared";

/**
 * The wiki in 3D: each circle a glowing sphere with its pages gathered
 * around it, links and
 * pins drawn between them. Drag to turn, scroll to zoom, hover for a name,
 * click to fly to it and open its panel.
 */

type Node3D = GraphNode & { x?: number; y?: number; z?: number };
type Link3D = { source: string; target: string; kind: GraphEdgeKind };

export function Globe3DView({
  graph,
  colors,
  kinds,
  edgeKinds,
  onSelect,
}: {
  graph: WikiGraph;
  colors: Map<string, string>;
  kinds: Set<GraphNodeKind>;
  edgeKinds: Set<GraphEdgeKind>;
  onSelect: (id: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let disposed = false;
    let graph3d: { _destructor: () => void; width: (w: number) => unknown; height: (h: number) => unknown } | null = null;
    let observer: ResizeObserver | null = null;
    (async () => {
      const [{ default: ForceGraph3D }, { default: SpriteText }] = await Promise.all([import("3d-force-graph"), import("three-spritetext")]);
      if (disposed) return;
      const nodes: Node3D[] = graph.nodes.filter((node) => node.kind === "circle" || kinds.has(node.kind)).map((node) => ({ ...node }));
      const ids = new Set(nodes.map((node) => node.id));
      const links: Link3D[] = graph.edges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target) && (edge.kind === "belongs" || edgeKinds.has(edge.kind)))
        .map((edge) => ({ ...edge }));
      // Documents gather around their circle too.
      for (const node of nodes) {
        if (node.kind === "document" && node.circleId && ids.has(`circle:${node.circleId}`)) {
          links.push({ source: node.id, target: `circle:${node.circleId}`, kind: "belongs" });
        }
      }
      const hue = (node: GraphNode) => (node.circleId ? colors.get(node.circleId) : undefined) ?? "#8c8f86";
      const height = Math.max(420, Math.min(window.innerHeight * 0.72, element.clientWidth * 1.1));
      // The library's own types don't know our node and link fields; it's driven loosely here.
      const Graph = ForceGraph3D as unknown as new (element: HTMLElement, options?: object) => any;
      const instance = new Graph(element, { controlType: "orbit" })
        .width(element.clientWidth)
        .height(height)
        .backgroundColor("#0f1d18")
        .showNavInfo(false)
        .graphData({ nodes, links })
        .nodeId("id")
        .nodeVal((node: Node3D) => (node.kind === "circle" ? 28 : node.kind === "note" ? 4 : 2.5))
        .nodeColor((node: Node3D) => (node.kind === "circle" ? hue(node) : nodeFill(node)))
        .nodeOpacity(0.92)
        .nodeResolution(24)
        .nodeLabel(() => "")
        .nodeThreeObjectExtend(true)
        .nodeThreeObject((node: Node3D) => {
          if (node.kind !== "circle") return null;
          const label = new SpriteText(node.label);
          label.color = "#f4f8f2";
          label.textHeight = 7;
          label.fontWeight = "600";
          label.backgroundColor = "rgba(15,29,24,0.55)";
          label.padding = 2;
          label.borderRadius = 3;
          (label as unknown as { position: { set: (x: number, y: number, z: number) => void } }).position.set(0, 16, 0);
          return label;
        })
        .linkColor((link: Link3D) => (link.kind === "pin" ? "#e0a849" : link.kind === "link" ? "#cfe3d4" : "#5d7a6b"))
        .linkOpacity(0.35)
        .linkWidth((link: Link3D) => (link.kind === "link" ? 0.8 : link.kind === "pin" ? 0.6 : 0.3))
        .linkDirectionalParticles((link: Link3D) => (link.kind === "link" ? 2 : 0))
        .linkDirectionalParticleWidth(1.2)
        .linkDirectionalParticleColor(() => "#f6dc6b")
        .onNodeHover((node: Node3D | null) => {
          element.style.cursor = node ? "pointer" : "default";
          setHovered(node);
        })
        .onNodeClick((node: Node3D) => {
          // Ease the camera toward it, then show its panel.
          const distance = 110;
          const ratio = 1 + distance / Math.max(1, Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0));
          instance.cameraPosition({ x: (node.x ?? 0) * ratio, y: (node.y ?? 0) * ratio, z: (node.z ?? 0) * ratio }, node, 900);
          selectRef.current(node.id);
        })
        .onBackgroundClick(() => selectRef.current(null));
      instance.d3Force("link")?.distance((link: { kind: GraphEdgeKind }) => (link.kind === "belongs" ? 38 : 110)).strength((link: { kind: GraphEdgeKind }) => (link.kind === "belongs" ? 0.9 : 0.05));
      instance.d3Force("charge")?.strength(-70);
      instance.cameraPosition({ z: 420 });
      graph3d = instance;
      observer = new ResizeObserver(() => instance.width(element.clientWidth));
      observer.observe(element);
    })();
    return () => {
      disposed = true;
      observer?.disconnect();
      graph3d?._destructor();
      element.replaceChildren();
    };
  }, [graph, colors, kinds, edgeKinds]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-[#0f1d18]"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setMouse({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}
    >
      <div ref={box} className="min-h-[420px] w-full" aria-label="3D map of wiki pages by circle" role="img" />
      {hovered ? <NameTip node={hovered} graph={graph} x={mouse.x} y={mouse.y} bounds={{ width: box.current?.clientWidth ?? 600, height: box.current?.clientHeight ?? 500 }} /> : null}
      <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-[#cfe3d4]/70">Drag to turn · scroll to zoom · click for details</p>
    </div>
  );
}
