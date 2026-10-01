import type { DirectoryDocument } from "@/lib/directory/types";
import { wikiLinksIn } from "@/lib/wiki/links";
import { embeddedPages } from "@/lib/wiki/sections";
import { readPages, type WikiPage } from "@/lib/wiki/store";
import { visiblePages, type WikiViewer } from "@/lib/wiki/access";
import { listPins } from "./store";
import { excerptOf, pageColor, resolveTarget } from "./server";
import type { NoteColor, PinKind } from "./shared";

/**
 * The map of how the wiki connects (for everyone, each seeing the pages
 * they can): every page, the circle it belongs to, the pages it links to
 * (or embeds), and where it's pinned (circles and the dashboard).
 */

export type GraphNodeKind = "note" | PinKind;
export type GraphEdgeKind = "link" | "pin" | "belongs";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  href: string;
  external?: boolean;
  /** A page's parent circle. */
  circleId?: string;
  color?: NoteColor;
  /** A page's opening lines, for the map's hover card. */
  excerpt?: string;
  /** Who last edited a page, and when. */
  edited?: { by: string; at: string };
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface WikiGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  circles: { id: string; name: string }[];
}

const noteId = (pageId: string) => `note:${pageId}`;

/** The map as `viewer` sees it: only the pages they can see (and so only links and pins between those). */
export async function buildWikiGraph(directory: DirectoryDocument, viewer: WikiViewer): Promise<WikiGraph> {
  const circles = directory.circles;
  const [allPages, pins] = await Promise.all([readPages(), listPins(circles, {})]);
  const pages = visiblePages(viewer, directory, allPages);

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, kind: GraphEdgeKind) => {
    const key = `${source}|${target}|${kind}`;
    if (source === target || seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind });
  };
  const addCircle = (circleId: string) => {
    const circle = circles.find((entry) => entry.id === circleId);
    if (circle && !nodes.has(`circle:${circle.id}`)) nodes.set(`circle:${circle.id}`, { id: `circle:${circle.id}`, kind: "circle", label: circle.name, href: `/circles/${circle.id}`, circleId: circle.id });
  };

  // Pages, each with the circle that keeps it.
  const byTitle = new Map<string, WikiPage>();
  for (const page of pages) {
    addCircle(page.keeper);
    nodes.set(noteId(page.id), {
      id: noteId(page.id),
      kind: "note",
      label: page.title,
      href: `/wiki/${page.slug}`,
      circleId: page.keeper,
      color: pageColor(page),
      excerpt: excerptOf(page.body, 220),
      edited: { by: page.updatedBy.name, at: page.updatedAt },
    });
    byTitle.set(page.title.toLowerCase(), page);
  }
  // Each page belongs to its keeper.
  for (const page of pages) addEdge(noteId(page.id), `circle:${page.keeper}`, "belongs");

  // Links between pages (embeds count). Documents aren't on the map.
  for (const page of pages) {
    for (const link of [...wikiLinksIn(page.body, circles), ...embeddedPages(page.body, circles)]) {
      if (link.kind !== "page") continue;
      const target = byTitle.get(link.title.toLowerCase());
      if (target) addEdge(noteId(page.id), noteId(target.id), "link");
    }
  }

  // Pins.
  for (const pin of pins) {
    const from = noteId(pin.note.pageId);
    if (!nodes.has(from) || pin.target.kind === "document") continue;
    // On its own circle's page: that's where it belongs, already drawn.
    const keeper = pages.find((page) => page.id === pin.note.pageId)?.keeper;
    if (pin.target.kind === "circle" && pin.target.id === keeper) {
      addEdge(from, `circle:${keeper}`, "belongs");
      continue;
    }
    const to = `${pin.target.kind}:${pin.target.id}`;
    if (!nodes.has(to)) {
      const resolved = await resolveTarget(directory, pin.target);
      if (!resolved) continue;
      nodes.set(to, {
        id: to,
        kind: pin.target.kind,
        label: resolved.label,
        href: resolved.href,
        ...(resolved.external ? { external: true } : {}),
        ...(resolved.circleId && pin.target.kind !== "community" ? { circleId: resolved.circleId } : {}),
      });
    }
    addEdge(from, to, "pin");
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    circles: circles.filter((circle) => nodes.has(`circle:${circle.id}`)).map((circle) => ({ id: circle.id, name: circle.name })),
  };
}
