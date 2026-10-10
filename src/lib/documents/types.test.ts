import { describe, expect, it } from "vitest";
import { shownWithPage } from "./types";

describe("shownWithPage", () => {
  const live = new Set(["page-1"]);

  it("is a file made into a page that's still there", () => {
    expect(shownWithPage({ madeInto: { pageId: "page-1" } }, live)).toBe(true);
  });

  it("isn't once that page is gone (or in the trash)", () => {
    expect(shownWithPage({ madeInto: { pageId: "page-2" } }, live)).toBe(false);
  });

  it("isn't a file never made into a page", () => {
    expect(shownWithPage({}, live)).toBe(false);
    expect(shownWithPage({ madeInto: null }, live)).toBe(false);
  });
});
