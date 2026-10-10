import { beforeEach, describe, expect, it, vi } from "vitest";

/** The wiki's trash: deleting keeps a page 30 days; restoring puts it back (renamed if need be); then it's gone. */

const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => structuredClone(docs.get(key) ?? null),
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown; write?: boolean }
  ) => {
    const next = change(structuredClone(docs.get(key) ?? null));
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
  deleteJson: async (key: string) => void docs.delete(key),
}));
vi.mock("@/lib/directory/store", () => ({ readDirectory: async () => null }));

const store = await import("./store");
const trash = await import("./trash");

const cara = { userId: "u-cara", name: "Cara Cedar" };
const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 12));

async function made(title: string) {
  const result = await store.createPage(cara, { title, body: `About ${title}.`, keeper: "lcc" });
  if (!result.ok || !result.page) throw new Error("not made");
  return result.page;
}

beforeEach(() => {
  docs.clear();
  // Already brought together from the old per-circle wikis.
  docs.set("wiki/pages.json", { version: 1, pages: [] });
});

describe("the trash", () => {
  it("keeps a deleted page out of the wiki, with its history and comments", async () => {
    const page = await made("Mowing");
    docs.set(`wiki/history/${page.id}.json`, { versions: [{ title: "Mowing", body: "x" }] });
    docs.set(`wiki/comments/${page.id}.json`, { comments: [] });
    expect((await trash.trashPage(page, cara, day(0))).ok).toBe(true);
    expect(await store.readPages()).toEqual([]);
    const [entry] = await trash.listTrash(day(1));
    expect(entry).toMatchObject({ page: { id: page.id }, deletedBy: cara });
    expect(docs.has(`wiki/history/${page.id}.json`)).toBe(true);
    expect(docs.has(`wiki/comments/${page.id}.json`)).toBe(true);
  });

  it("restores a page as it was — or renamed and re-addressed if another took its place", async () => {
    const page = await made("Mowing");
    await trash.trashPage(page, cara, day(0));
    const usurper = await made("Mowing");
    // Its address was free while it was in the trash.
    expect(usurper.slug).toBe("mowing");
    const back = await trash.restoreFromTrash(page.id, {}, day(2));
    expect(back).toMatchObject({
      ok: true,
      page: { id: page.id, title: "Mowing (restored)", slug: "mowing-restored" },
    });
    expect(await trash.listTrash(day(2))).toEqual([]);
    // Restoring again: nothing there.
    expect(await trash.restoreFromTrash(page.id, {}, day(2))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("finishes a delete that stopped halfway, and can hand a page to another circle", async () => {
    const page = await made("Stove");
    // In the trash, but still among the pages (the second write never happened).
    docs.set("wiki/trash.json", {
      pages: [{ page, deletedAt: day(0).toISOString(), deletedBy: cara }],
    });
    const back = await trash.restoreFromTrash(page.id, { keeper: "board" }, day(1));
    expect(back.ok && back.page.title).toBe("Stove");
    expect((await store.readPages()).filter((entry) => entry.id === page.id)).toHaveLength(1);
    const gone = await made("Old notes");
    await trash.trashPage(gone, cara, day(0));
    const moved = await trash.restoreFromTrash(gone.id, { keeper: "board" }, day(1));
    expect(moved.ok && moved.page.keeper).toBe("board");
  });

  it("forgets pages after 30 days, and what they left behind", async () => {
    const old = await made("Old");
    const recent = await made("Recent");
    docs.set(`wiki/history/${old.id}.json`, { versions: [] });
    docs.set(`wiki/comments/${old.id}.json`, { comments: [] });
    docs.set(`wiki/perspectives/${old.id}.json`, { perspectives: [] });
    await trash.trashPage(old, cara, day(0));
    await trash.trashPage(recent, cara, day(20));
    expect(await trash.listTrash(day(29))).toHaveLength(2);
    const left = await trash.listTrash(day(31));
    expect(left.map((entry) => entry.page.title)).toEqual(["Recent"]);
    expect(docs.has(`wiki/history/${old.id}.json`)).toBe(false);
    expect(docs.has(`wiki/comments/${old.id}.json`)).toBe(false);
    expect(docs.has(`wiki/perspectives/${old.id}.json`)).toBe(false);
    expect(trash.keptUntil({ deletedAt: day(20).toISOString() })).toBe(day(50).toISOString());
  });

  it("deletes for good on request", async () => {
    const page = await made("Draft");
    docs.set(`wiki/history/${page.id}.json`, { versions: [] });
    await trash.trashPage(page, cara, day(0));
    expect(await trash.deleteForever(page.id, day(1))).toEqual({ ok: true });
    expect(await trash.listTrash(day(1))).toEqual([]);
    expect(docs.has(`wiki/history/${page.id}.json`)).toBe(false);
    expect(await trash.deleteForever(page.id, day(1))).toEqual({ ok: false, reason: "not_found" });
  });
});
