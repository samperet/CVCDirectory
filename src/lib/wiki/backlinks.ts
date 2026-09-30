import type { Circle } from "@/lib/directory/types";
import { featureEnabled } from "@/lib/circles/features";
import { wikiLinksIn } from "./links";
import { readPages } from "./store";

export interface Backlink {
  circleId: string;
  circleName: string;
  slug: string;
  title: string;
}

/**
 * The pages — in any circle's wiki that's turned on — whose links point to
 * the page titled `title` in `circleId`'s wiki. Links name pages by title, so
 * this reads every wiki's pages and follows their links.
 */
export async function backlinksTo(circleId: string, pageId: string, title: string, circles: Circle[]): Promise<Backlink[]> {
  const wanted = title.toLowerCase();
  const wikis = circles.filter((circle) => featureEnabled(circle, "wiki"));
  const found = await Promise.all(
    wikis.map(async (circle) =>
      (await readPages(circle.id))
        .filter((page) => page.id !== pageId)
        .filter((page) => wikiLinksIn(page.body, circle.id, circles).some((link) => link.kind === "page" && link.circleId === circleId && link.title.toLowerCase() === wanted))
        .map((page) => ({ circleId: circle.id, circleName: circle.name, slug: page.slug, title: page.title }))
    )
  );
  // This circle's pages first, then the others', each by title.
  return found.flat().sort((a, b) => Number(a.circleId !== circleId) - Number(b.circleId !== circleId) || a.circleName.localeCompare(b.circleName) || a.title.localeCompare(b.title));
}
