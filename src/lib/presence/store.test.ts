import { beforeEach, describe, expect, it, vi } from "vitest";

/** Who's online: a check-in, not rewritten when fresh; leaving; going quiet. */

const docs = new Map<string, unknown>();
let writes = 0;
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => structuredClone(docs.get(key) ?? null),
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(structuredClone(docs.get(key) ?? null));
    if ("value" in next) {
      writes++;
      docs.set(key, next.value);
    }
    return next.result;
  },
}));

const { checkIn, onlineNow, ONLINE_MS, REWRITE_MS } = await import("./store");
const ADA = "000000000001";
const BEN = "000000000002";
const now = 1_800_000_000_000;

beforeEach(() => {
  docs.clear();
  writes = 0;
});

describe("presence", () => {
  it("is written once, then not again while fresh", async () => {
    expect(await checkIn(ADA, true, now)).toEqual([ADA]);
    expect(await checkIn(ADA, true, now + REWRITE_MS - 1)).toEqual([ADA]);
    expect(writes).toBe(1);
    await checkIn(ADA, true, now + REWRITE_MS);
    expect(writes).toBe(2);
  });

  it("lists those seen lately; leaving takes you off at once", async () => {
    await checkIn(ADA, true, now);
    await checkIn(BEN, true, now + 1000);
    expect((await onlineNow(now + 2000)).sort()).toEqual([ADA, BEN]);
    expect(await checkIn(BEN, false, now + 3000)).toEqual([ADA]);
    expect(await checkIn(BEN, false, now + 4000)).toEqual([ADA]);
    expect(writes).toBe(3);
  });

  it("forgets those who've gone quiet", async () => {
    await checkIn(ADA, true, now);
    expect(await onlineNow(now + ONLINE_MS)).toEqual([]);
    await checkIn(BEN, true, now + ONLINE_MS);
    expect(Object.keys((docs.get("presence/online.json") as { people: object }).people)).toEqual([
      BEN,
    ]);
  });
});
