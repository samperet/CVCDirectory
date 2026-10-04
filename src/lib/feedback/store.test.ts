import { beforeEach, describe, expect, it, vi } from "vitest";

// The reports, in memory.
const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => docs.get(key) ?? null,
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(docs.get(key) ?? null);
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
}));

const store = await import("./store");
const ada = { userId: "u-ada", personId: "000000000001", name: "Ada Ash" };
const input = { kind: "bug" as const, body: "The calendar is blank", page: "/calendar" };

async function send(at = new Date()) {
  const result = await store.addReport(ada, { ...input, browser: "Safari" }, at);
  if (!result.ok) throw new Error(result.reason);
  return result.report;
}

beforeEach(() => docs.clear());

describe("bug reports and feature requests", () => {
  it("keep what was said, by whom, from where, open until marked done", async () => {
    const report = await send();
    expect(report).toMatchObject({ ...input, browser: "Safari", doneAt: null });
    expect(report.by).toEqual(ada);
    const done = await store.setReportDone(report.id, true, { name: "Finn Fir" });
    expect(done.ok && done.report.doneBy).toBe("Finn Fir");
    const open = await store.setReportDone(report.id, false, { name: "Finn Fir" });
    expect(open.ok && open.report.doneAt).toBeNull();
    expect(await store.setReportDone("nope", true, { name: "Finn Fir" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("are listed newest first, and can be deleted", async () => {
    const first = await send(new Date("2026-10-01T00:00:00Z"));
    const second = await send(new Date("2026-10-02T00:00:00Z"));
    expect((await store.listReports()).map((report) => report.id)).toEqual([second.id, first.id]);
    expect(await store.deleteReport(first.id)).toBe(true);
    expect(await store.deleteReport(first.id)).toBe(false);
  });

  it("make room by dropping the oldest done ones, never open ones", async () => {
    const reports = Array.from({ length: 1000 }, (_, index) => ({
      id: `r${index}`,
      ...input,
      browser: null,
      by: ada,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      doneAt: index === 5 ? "2026-02-01T00:00:00.000Z" : null,
      doneBy: index === 5 ? "Finn Fir" : null,
    }));
    docs.set("feedback/reports.json", { reports });
    await send();
    const ids = (await store.listReports()).map((report) => report.id);
    expect(ids).toHaveLength(1000);
    expect(ids).not.toContain("r5");
    expect(await store.addReport(ada, { ...input, browser: null })).toEqual({
      ok: false,
      reason: "full",
    });
  });

  it("need a kind, a few words, and a page in the app", () => {
    expect(store.feedbackInputSchema.safeParse(input).success).toBe(true);
    expect(store.feedbackInputSchema.safeParse({ ...input, kind: "praise" }).success).toBe(false);
    expect(store.feedbackInputSchema.safeParse({ ...input, body: " a " }).success).toBe(false);
    expect(
      store.feedbackInputSchema.safeParse({ ...input, page: "https://elsewhere.example" }).success
    ).toBe(false);
  });
});
