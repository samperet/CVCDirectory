import { describe, expect, it } from "vitest";
import type { WikiPageSummary } from "@/lib/wiki/store";
import { pagesFor, sortPages, sortsFor } from "./info-sort";

const page = (
  id: string,
  title: string,
  updatedAt: string,
  extra: Partial<WikiPageSummary> = {}
): WikiPageSummary =>
  ({
    id,
    slug: id,
    title,
    updatedAt,
    updatedBy: { personId: null, name: "Ada" },
    keeper: "lcc",
    edit: "members",
    ...extra,
  }) as WikiPageSummary;

const pages = [
  page("a", "Mowing", "2026-09-03", { meetingDate: "2026-09-10" }),
  page("b", "Aims", "2026-09-05"),
  page("c", "Minutes 2026-08", "2026-09-01", { meetingDate: "2026-08-20" }),
  page("d", "Zoning", "2026-09-04", { keeper: "board" }),
];
const titles = (list: { title: string }[]) => list.map((entry) => entry.title);

describe("sorting a Filtered Documents module", () => {
  it("sorts by title, last edited, meeting date, or as chosen", () => {
    expect(titles(sortPages(pages, "title"))).toEqual([
      "Aims",
      "Minutes 2026-08",
      "Mowing",
      "Zoning",
    ]);
    expect(titles(sortPages(pages, "updated"))).toEqual([
      "Aims",
      "Zoning",
      "Mowing",
      "Minutes 2026-08",
    ]);
    expect(titles(sortPages(pages, "meeting"))).toEqual([
      "Mowing",
      "Minutes 2026-08",
      "Aims",
      "Zoning",
    ]);
    expect(titles(sortPages(pages, "chosen", ["c", "a", "nope"]))).toEqual([
      "Minutes 2026-08",
      "Mowing",
    ]);
  });

  it("uses each filter's own order unless told otherwise", () => {
    expect(titles(pagesFor({ filter: { kind: "circle", circleId: "lcc" } }, pages))).toEqual([
      "Aims",
      "Minutes 2026-08",
      "Mowing",
    ]);
    expect(
      titles(pagesFor({ filter: { kind: "circle", circleId: "lcc" }, sort: "updated" }, pages))
    ).toEqual(["Aims", "Mowing", "Minutes 2026-08"]);
    expect(titles(pagesFor({ filter: { kind: "pages", pageIds: ["b", "a"] } }, pages))).toEqual([
      "Aims",
      "Mowing",
    ]);
    expect(
      titles(pagesFor({ filter: { kind: "pages", pageIds: ["b", "a"] }, sort: "title" }, pages))
    ).toEqual(["Aims", "Mowing"]);
  });

  it("takes the latest edited first, then sorts those", () => {
    expect(titles(pagesFor({ filter: { kind: "recent", limit: 3 } }, pages))).toEqual([
      "Aims",
      "Zoning",
      "Mowing",
    ]);
    expect(
      titles(pagesFor({ filter: { kind: "recent", limit: 3 }, sort: "title" }, pages))
    ).toEqual(["Aims", "Mowing", "Zoning"]);
  });

  it("offers the chosen order only for chosen pages", () => {
    expect(sortsFor("pages").map((entry) => entry.value)).toEqual([
      "chosen",
      "title",
      "updated",
      "meeting",
    ]);
    expect(sortsFor("circle").map((entry) => entry.value)).toEqual(["title", "updated", "meeting"]);
    expect(sortsFor("proposed")[0]).toEqual({ value: "", label: "Soonest to be decided" });
  });
});
