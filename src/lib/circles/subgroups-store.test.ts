import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Circle } from "./types";

/** Starting sub groups (where they can be, of their circle's kind) and deleting their circle. */

const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => structuredClone(docs.get(key) ?? null),
  readOrSeedJson: async (
    key: string,
    normalize: (raw: unknown) => unknown,
    seed: () => unknown
  ) => {
    if (!docs.has(key)) docs.set(key, seed());
    return normalize(structuredClone(docs.get(key)));
  },
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(structuredClone(docs.get(key) ?? null));
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
}));

const store = await import("./store");
const imported: Circle[] = [
  {
    id: "board",
    name: "Board",
    seats: [{ personId: "000000000001", name: "Ada", position: null, termEnds: null }],
  },
  { id: "lcc", name: "Land Care Circle", seats: [] },
];
const cara = { personId: "000000000003", name: "Cara Cedar" };
const circles = async () => store.readCircles(imported);

beforeEach(() => docs.clear());

describe("sub groups in the store", () => {
  it("start under a circle, of its kind, with their founder", async () => {
    const hedges = await store.createCircle(
      imported,
      { name: "Hedge Team", description: null, kind: "club", parentId: "lcc" },
      cara
    );
    expect(hedges).toMatchObject({ ok: true, value: { id: "hedge-team", parentId: "lcc" } });
    expect(hedges.ok && hedges.value.kind).toBeUndefined();
    // A club's sub group is a club.
    await store.createCircle(
      imported,
      { name: "Chicken Tenders", description: null, kind: "club" },
      cara
    );
    const coop = await store.createCircle(
      imported,
      { name: "Coop Builders", description: null, kind: "circle", parentId: "chicken-tenders" },
      cara
    );
    expect(coop.ok && coop.value.kind).toBe("club");
  });

  it("can't be under a sub group, Community, or a circle that isn't there", async () => {
    await store.createCircle(
      imported,
      { name: "Hedge Team", description: null, kind: "club", parentId: "lcc" },
      cara
    );
    for (const parentId of ["hedge-team", "community", "nowhere"])
      expect(
        await store.createCircle(
          imported,
          { name: `Under ${parentId}`, description: null, kind: "club", parentId },
          cara
        )
      ).toEqual({ ok: false, reason: "bad_parent" });
  });

  it("become circles of their own when their circle is deleted", async () => {
    await store.createCircle(
      imported,
      { name: "Hedge Team", description: null, kind: "club", parentId: "lcc" },
      cara
    );
    const deleted = await store.deleteCircle(imported, "lcc");
    expect(deleted).toMatchObject({ ok: true, value: { id: "lcc" } });
    const hedges = (await circles()).find((entry) => entry.id === "hedge-team");
    expect(hedges && "parentId" in hedges).toBe(false);
  });
});
