import type { DirectoryDocument } from "@/lib/directory/types";
import { listDocuments } from "@/lib/documents/store";
import { wikiLinksIn } from "@/lib/wiki/links";
import { embeddedPages } from "@/lib/wiki/sections";
import { readPages, type WikiPage } from "@/lib/wiki/store";
import { listPins } from "./store";
import { excerptOf, pageColor, resolveTarget } from "./server";
import type { NoteColor, PinKind } from "./shared";

/**
 * The map of how notes connect (for admins): every wiki page, the circle it
 * belongs to, the pages and documents it links to, and everywhere it's
 * pinned.
 */

export type GraphNodeKind = "note" | PinKind;
export type GraphEdgeKind = "link" | "pin" | "belongs" | "child";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  href: string;
  external?: boolean;
  /** A note's (or document's) circle. */
  circleId?: string;
  color?: NoteColor;
  /** A page's opening lines, for the map's hover card. */
  excerpt?: string;
  /** The page it was started from (a node id). */
  parent?: string;
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

export async function buildWikiGraph(directory: DirectoryDocument): Promise<WikiGraph> {
  const circles = directory.circles;
  const [pages, documents, pins] = await Promise.all([readPages(), listDocuments(), listPins(circles, {})]);

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
  const ids = new Set(pages.map((page) => page.id));
  const byTitle = new Map<string, WikiPage>();
  for (const page of pages) {
    addCircle(page.keeper);
    const parent = page.parentId && ids.has(page.parentId) ? noteId(page.parentId) : undefined;
    nodes.set(noteId(page.id), {
      id: noteId(page.id),
      kind: "note",
      label: page.title,
      href: `/wiki/${page.slug}`,
      circleId: page.keeper,
      color: pageColor(page),
      excerpt: excerptOf(page.body, 220),
      ...(parent ? { parent } : {}),
      edited: { by: page.updatedBy.name, at: page.updatedAt },
    });
    byTitle.set(page.title.toLowerCase(), page);
  }
  // A page started under another hangs off that page; the rest belong to their keeper.
  for (const page of pages) {
    if (page.parentId && ids.has(page.parentId)) addEdge(noteId(page.id), noteId(page.parentId), "child");
    else addEdge(noteId(page.id), `circle:${page.keeper}`, "belongs");
  }

  // Links between pages (embeds count), and to documents (the keeper's first, then any).
  for (const page of pages) {
    for (const link of [...wikiLinksIn(page.body, circles), ...embeddedPages(page.body, circles)]) {
      const wanted = link.title.toLowerCase();
      if (link.kind === "page") {
        const target = byTitle.get(wanted);
        if (target) addEdge(noteId(page.id), noteId(target.id), "link");
        continue;
      }
      const matches = documents.filter((doc) => doc.title.toLowerCase() === wanted && (!link.circleId || doc.circleId === link.circleId));
      const doc = matches.find((entry) => entry.circleId === page.keeper) ?? matches[0];
      if (!doc) continue;
      const id = `document:${doc.id}`;
      if (!nodes.has(id)) nodes.set(id, { id, kind: "document", label: doc.title, href: `/api/documents/${doc.id}/file`, external: true, circleId: doc.circleId });
      addEdge(noteId(page.id), id, "link");
    }
  }

  // Pins.
  for (const pin of pins) {
    const from = noteId(pin.note.pageId);
    if (!nodes.has(from)) continue;
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
