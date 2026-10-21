import type { WikiPageSummary } from "@/lib/wiki/store";
import { byDecision, pageStage } from "@/lib/wiki/consent";
import { INFO_SORT_LABELS, defaultInfoSort, type InfoFilter, type InfoSort } from "./layout";

/**
 * Which pages a Filtered Documents module shows, and in what order (pure,
 * for the module, its settings' preview and tests). The filter picks them —
 * chosen ones, a circle's, a circle's pages proposed before proposals were
 * their own, or the most recently edited — and the sort orders them: as
 * chosen, by title, last edited first, or by meeting date (latest first,
 * pages without one after). Unset, each filter has its own default
 * (`defaultInfoSort`); proposals waiting for consent go the soonest to be
 * decided first, then the newest.
 */

type Sortable = Pick<WikiPageSummary, "id" | "title" | "updatedAt" | "meetingDate">;

/** Pages in the chosen order (`sort` "chosen": `ids`, for a Specific pages filter). */
export function sortPages<T extends Sortable>(pages: T[], sort: InfoSort, ids: string[] = []): T[] {
  switch (sort) {
    case "chosen": {
      const byId = new Map(pages.map((page) => [page.id, page]));
      return ids.flatMap((id) => byId.get(id) ?? []);
    }
    case "title":
      return [...pages].sort((a, b) => a.title.localeCompare(b.title));
    case "updated":
      return [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    case "meeting":
      return [...pages].sort(
        (a, b) =>
          (b.meetingDate ?? "").localeCompare(a.meetingDate ?? "") || a.title.localeCompare(b.title)
      );
  }
}

/** The pages a module shows, in its order. */
export function pagesFor(
  info: { filter: InfoFilter; sort?: InfoSort },
  pages: WikiPageSummary[]
): WikiPageSummary[] {
  const { filter } = info;
  const sort = info.sort ?? defaultInfoSort(filter);
  if (filter.kind === "pages") {
    const chosen = sortPages(pages, "chosen", filter.pageIds);
    return sort === "chosen" ? chosen : sortPages(chosen, sort);
  }
  if (filter.kind === "proposed") {
    const proposed = pages.filter(
      (page) =>
        page.keeper === filter.circleId &&
        pageStage(page) === "proposed" &&
        !page.proposal?.proposalId
    );
    return info.sort ? sortPages(proposed, info.sort) : proposed.sort(byDecision);
  }
  if (filter.kind === "circle")
    return sortPages(
      pages.filter((page) => page.keeper === filter.circleId),
      sort
    );
  // The latest edited, then in the order asked for.
  const latest = pages
    .filter((page) => !filter.circleId || page.keeper === filter.circleId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, filter.limit);
  return sortPages(latest, sort);
}

/** The sorts a filter can take, with their labels (proposals' unset default first). */
export function sortsFor(kind: InfoFilter["kind"]): { value: InfoSort | ""; label: string }[] {
  const named = (sorts: InfoSort[]) =>
    sorts.map((value) => ({ value, label: INFO_SORT_LABELS[value] }));
  if (kind === "pages") return named(["chosen", "title", "updated", "meeting"]);
  if (kind === "proposed")
    return [
      { value: "", label: "Soonest to be decided" },
      ...named(["title", "updated", "meeting"]),
    ];
  return named(["title", "updated", "meeting"]);
}
