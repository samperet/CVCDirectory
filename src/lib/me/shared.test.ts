import { describe, expect, it } from "vitest";
import {
  MAX_RECENT,
  MAX_STARRED,
  normalizeLists,
  withStar,
  withView,
  type DatedRef,
} from "./shared";

const ref = (id: string, kind: DatedRef["kind"] = "page", at = "2026-10-01T00:00:00.000Z") => ({
  kind,
  id,
  at,
});

describe("withStar", () => {
  it("stars a document, newest first", () => {
    const list = withStar([ref("a")], { kind: "file", id: "b" }, true, "2026-10-02T00:00:00.000Z");
    expect(list?.map((entry) => `${entry.kind}:${entry.id}`)).toEqual(["file:b", "page:a"]);
  });

  it("keeps the list as it is when it's already starred", () => {
    const list = [ref("a")];
    expect(withStar(list, { kind: "page", id: "a" }, true, "2026-10-02T00:00:00.000Z")).toBe(list);
  });

  it("tells a page from a file with the same id", () => {
    const list = withStar([ref("a")], { kind: "file", id: "a" }, true, "x");
    expect(list).toHaveLength(2);
  });

  it("unstars", () => {
    expect(withStar([ref("a"), ref("b")], { kind: "page", id: "a" }, false, "x")).toEqual([
      ref("b"),
    ]);
  });

  it("has no room past the most", () => {
    const full = Array.from({ length: MAX_STARRED }, (_, index) => ref(`p${index}`));
    expect(withStar(full, { kind: "page", id: "new" }, true, "x")).toBeNull();
    expect(withStar(full, { kind: "page", id: "p3" }, false, "x")).toHaveLength(MAX_STARRED - 1);
  });
});

describe("withView", () => {
  it("puts what was opened at the top, once", () => {
    const list = withView([ref("a"), ref("b")], { kind: "page", id: "b" }, "later");
    expect(list.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(list[0].at).toBe("later");
  });

  it("keeps only the latest few", () => {
    const many = Array.from({ length: MAX_RECENT }, (_, index) => ref(`p${index}`));
    const list = withView(many, { kind: "proposal", id: "new" }, "later");
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].id).toBe("new");
    expect(list.some((entry) => entry.id === `p${MAX_RECENT - 1}`)).toBe(false);
  });
});

describe("normalizeLists", () => {
  it("drops anything unexpected", () => {
    expect(
      normalizeLists({
        starred: [ref("a"), { kind: "tweet", id: "x", at: "y" }, null, { kind: "page", id: 3 }],
        recent: "nope",
      })
    ).toEqual({ starred: [ref("a")], recent: [] });
    expect(normalizeLists(null)).toEqual({ starred: [], recent: [] });
  });
});
