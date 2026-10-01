import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { listDocuments } from "@/lib/documents/store";
import { listPages } from "@/lib/wiki/store";

export const dynamic = "force-dynamic";

const PAGES = 8;
const DOCUMENTS = 5;

/**
 * What typing @ in a wiki page finds: page titles in every wiki that's on
 * (`circle`'s own first), and document titles, best matches first —
 * leaving out `page`, the one being written.
 */
export async function GET(request: NextRequest) {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const circleId = params.get("circle") ?? "";
  const pageId = params.get("page") ?? "";
  const circles = ctx.directory.circles.filter((circle) => circle.id === circleId || featureEnabled(circle, "wiki"));

  // A title starting with the words scores above one containing them; this circle's above others'.
  const rank = (title: string, mine: boolean) => {
    const lower = title.toLowerCase();
    const at = query ? lower.indexOf(query) : 0;
    if (at < 0) return null;
    return (mine ? 0 : 10) + (at === 0 ? 0 : /\s/.test(lower[at - 1] ?? "") ? 1 : 2);
  };

  const pages = (
    await Promise.all(
      circles.map(async (circle) =>
        (await listPages(circle.id)).flatMap((page) => {
          const score = page.id === pageId ? null : rank(page.title, circle.id === circleId);
          return score === null ? [] : [{ circleId: circle.id, circleName: circle.name, title: page.title, slug: page.slug, color: page.color ?? "yellow", score }];
        })
      )
    )
  )
    .flat()
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
    .slice(0, PAGES);

  const circleName = (id: string) => ctx.directory.circles.find((circle) => circle.id === id)?.name ?? "";
  const allDocuments = query ? await listDocuments() : [];
  // Another circle's document with the same title: the link then names the circle.
  const ambiguous = (doc: (typeof allDocuments)[number]) =>
    allDocuments.some((other) => other.id !== doc.id && other.circleId !== doc.circleId && other.title.toLowerCase() === doc.title.toLowerCase());
  const documents = query
    ? allDocuments
        .flatMap((doc) => {
          const score = rank(doc.title, doc.circleId === circleId);
          return score === null ? [] : [{ id: doc.id, title: doc.title, circleId: doc.circleId, circleName: circleName(doc.circleId), ambiguous: ambiguous(doc), score }];
        })
        .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
        .slice(0, DOCUMENTS)
    : [];

  // Whether a page with exactly this title is in this circle's wiki already (so "Create page" isn't offered).
  const exists = !!query && (await listPages(circleId).catch(() => [])).some((page) => page.title.toLowerCase() === query);
  return NextResponse.json({ pages, documents, exists }, { headers: { "Cache-Control": "private, no-store" } });
}
