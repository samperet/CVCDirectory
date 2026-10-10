import { beforeEach, describe, expect, it, vi } from "vitest";

/** Alternative versions of a page: a copy to start, its author's alone, saved safely, brought up to date. */

const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => structuredClone(docs.get(key) ?? null),
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(structuredClone(docs.get(key) ?? null));
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
  deleteJson: async (key: string) => void docs.delete(key),
}));

const store = await import("./perspectives");
const { MAX_OPEN, isLive, isStale, versionOf } = await import("./perspectives-shared");

const eve = { userId: "u-eve", personId: "000000000005", name: "Eve Elm", admin: false };
const dev = { userId: "u-dev", personId: "000000000004", name: "Dev Dogwood", admin: false };
const finn = { userId: "u-finn", personId: "000000000006", name: "Finn Fir", admin: true };
const at = (minute: number) => new Date(Date.UTC(2026, 9, 10, 12, minute));
const page = {
  id: "page-mowing",
  body: "# Mowing\n\nMow monthly.\n\nThanks.\n",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

async function started(editor = eve, name = "Mow twice a month") {
  const result = await store.startPerspective(page, editor, { name }, at(0));
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

beforeEach(() => docs.clear());

describe("alternative versions", () => {
  it("start as a copy of the page", async () => {
    const mine = await started();
    expect(mine).toMatchObject({
      pageId: page.id,
      name: "Mow twice a month",
      body: page.body,
      base: { updatedAt: page.updatedAt, body: page.body },
      createdBy: { userId: "u-eve", personId: "000000000005", name: "Eve Elm" },
      status: "open",
    });
    expect(isLive(mine)).toBe(true);
    expect(isStale(mine, page.updatedAt)).toBe(false);
    expect(await store.listPerspectives(page.id)).toHaveLength(1);
    expect(versionOf(mine.createdBy)).toBe("Eve's version");
    expect(versionOf({ name: "Les Paul" })).toBe("Les' version");
  });

  it("are changed only by their author (or an admin), against their last save", async () => {
    const mine = await started();
    const body = "# Mowing\n\nMow twice a month.\n\nThanks.\n";
    expect(
      await store.savePerspective(page.id, mine.id, dev, { body, baseUpdatedAt: mine.updatedAt })
    ).toEqual({ ok: false, reason: "forbidden" });
    const saved = await store.savePerspective(
      page.id,
      mine.id,
      eve,
      { body, baseUpdatedAt: mine.updatedAt },
      at(1)
    );
    expect(saved).toMatchObject({ ok: true, value: { body, name: "Mow twice a month" } });
    // Another device still holding the first save is refused.
    expect(
      await store.savePerspective(page.id, mine.id, eve, {
        body: "Older text",
        baseUpdatedAt: mine.updatedAt,
      })
    ).toEqual({ ok: false, reason: "conflict" });
    const renamed = await store.savePerspective(
      page.id,
      mine.id,
      finn,
      { name: "Twice monthly", baseUpdatedAt: at(1).toISOString() },
      at(2)
    );
    expect(renamed).toMatchObject({
      ok: true,
      value: { name: "Twice monthly", body, updatedBy: { name: "Finn Fir" } },
    });
    expect(await store.getPerspective(page.id, "nope")).toBeNull();
  });

  it(`keep at most ${MAX_OPEN} open on a page`, async () => {
    for (let i = 0; i < MAX_OPEN; i++) await started(eve, `Idea ${i}`);
    expect(await store.startPerspective(page, dev, { name: "One more" })).toEqual({
      ok: false,
      reason: "full",
    });
    const [first] = await store.listPerspectives(page.id);
    await store.withdrawPerspective(page.id, first.id, eve);
    expect((await store.startPerspective(page, dev, { name: "One more" })).ok).toBe(true);
  });

  it("drop the oldest closed ones past the most kept", async () => {
    for (let i = 0; i < 70; i++) {
      const one = await started(eve, `Idea ${i}`);
      await store.withdrawPerspective(page.id, one.id, eve, at(i + 1));
    }
    const kept = await store.listPerspectives(page.id);
    expect(kept).toHaveLength(60);
    expect(kept[0].name).toBe("Idea 10");
  });

  it("bring the page's changes in, keeping theirs where both changed the same passage", async () => {
    const mine = await started();
    const body = "# Mowing\n\nMow twice a month.\n\nThanks.\n";
    await store.savePerspective(
      page.id,
      mine.id,
      eve,
      { body, baseUpdatedAt: mine.updatedAt },
      at(1)
    );
    // The page moved on: a new paragraph at the end, and the same paragraph changed.
    const now = {
      body: "# Mowing\n\nMow every three weeks.\n\nThanks.\n\nAsk Ben first.\n",
      updatedAt: "2026-10-05T00:00:00.000Z",
    };
    const stale = (await store.getPerspective(page.id, mine.id))!;
    expect(isStale(stale, now.updatedAt)).toBe(true);
    expect(store.caughtUp(stale, now).text).toBe(
      "# Mowing\n\nMow twice a month.\n\nThanks.\n\nAsk Ben first.\n"
    );
    expect(await store.catchUp(page.id, mine.id, dev, now)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    const caught = await store.catchUp(page.id, mine.id, eve, now, at(2));
    if (!caught.ok) throw new Error(caught.reason);
    expect(caught.value.perspective.body).toBe(
      "# Mowing\n\nMow twice a month.\n\nThanks.\n\nAsk Ben first.\n"
    );
    expect(caught.value.perspective.base).toEqual(now);
    expect(caught.value.conflicts).toEqual([
      { mine: "Mow twice a month.", theirs: "Mow every three weeks." },
    ]);
    expect(isStale(caught.value.perspective, now.updatedAt)).toBe(false);
  });

  it("are shared once, withdrawn, and then closed to changes", async () => {
    const mine = await started();
    const first = await store.sharePerspective(page.id, mine.id, eve, at(1));
    expect(first).toMatchObject({ ok: true, value: { fresh: true } });
    expect(await store.sharePerspective(page.id, mine.id, eve, at(2))).toMatchObject({
      ok: true,
      value: { fresh: false, perspective: { sharedAt: at(1).toISOString() } },
    });
    expect(await store.withdrawPerspective(page.id, mine.id, dev)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    const withdrawn = await store.withdrawPerspective(page.id, mine.id, eve, at(3));
    expect(withdrawn).toMatchObject({ ok: true, value: { status: "withdrawn" } });
    expect(
      await store.savePerspective(page.id, mine.id, eve, {
        body: "More",
        baseUpdatedAt: at(3).toISOString(),
      })
    ).toEqual({ ok: false, reason: "closed" });
  });

  it("record what became of them, and go with their page", async () => {
    const mine = await started();
    const adopted = await store.setOutcome(page.id, mine.id, {
      kind: "adopted",
      at: at(5).toISOString(),
      by: { name: "Cara Cedar" },
      pageVersion: "2026-10-10T12:05:00.000Z",
    });
    expect(adopted.ok && isLive(adopted.value)).toBe(false);
    expect(
      await store.savePerspective(page.id, mine.id, eve, {
        body: "More",
        baseUpdatedAt: mine.updatedAt,
      })
    ).toEqual({ ok: false, reason: "closed" });
    const cleared = await store.setOutcome(page.id, mine.id, null);
    expect(cleared.ok && isLive(cleared.value)).toBe(true);
    await store.deletePerspectives(page.id);
    expect(await store.listPerspectives(page.id)).toEqual([]);
  });
});
