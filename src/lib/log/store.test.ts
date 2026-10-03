import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentActor } from "@/lib/comments/store";

// The log's documents, in memory.
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
  deleteJson: async (key: string) => void docs.delete(key),
  enqueue: (_key: string, task: () => unknown) => task(),
}));

const { addLogEntry, editLogEntry, listLog, logInputSchema, logUpdateSchema } = await import(
  "./store"
);

const ada: CommentActor = {
  userId: "u-ada",
  personId: "p-ada",
  name: "Ada Ash",
  canModerate: false,
};
const ben: CommentActor = { ...ada, userId: "u-ben", personId: "p-ben", name: "Ben Birch" };
const benBirch = { personId: "0123456789ab", name: "Ben Birch" };
const plumber = { name: "The plumber" };

async function post(input: { body: string; parentId?: string | null; people?: object[] }) {
  const result = await addLogEntry("c1", ada, logInputSchema.parse(input));
  if (!result.ok || !result.entry) throw new Error("not posted");
  return result.entry;
}

beforeEach(() => docs.clear());

describe("people an update involved", () => {
  it("are kept with an update", async () => {
    const entry = await post({ body: "Fixed the gate", people: [benBirch, plumber] });
    expect(entry.people).toEqual([benBirch, plumber]);
    expect((await listLog("c1"))[0].people).toEqual([benBirch, plumber]);
  });

  it("are left off when there are none, and never kept on a reply", async () => {
    const update = await post({ body: "Fixed the gate", people: [] });
    expect(update).not.toHaveProperty("people");
    const reply = await post({ body: "Thanks!", parentId: update.id, people: [benBirch] });
    expect(reply).not.toHaveProperty("people");
  });

  it("can be changed or cleared by the update's author, without marking it edited", async () => {
    const entry = await post({ body: "Fixed the gate" });
    const added = await editLogEntry("c1", entry.id, ada, { people: [benBirch] });
    expect(added).toMatchObject({
      ok: true,
      entry: { body: "Fixed the gate", people: [benBirch] },
    });
    expect(added.ok && added.entry?.editedAt).toBeFalsy();
    const cleared = await editLogEntry("c1", entry.id, ada, { people: [] });
    expect(cleared.ok && cleared.entry).not.toHaveProperty("people");
  });

  it("stay put when only the text is edited", async () => {
    const entry = await post({ body: "Fixed the gate", people: [benBirch] });
    const edited = await editLogEntry("c1", entry.id, ada, { body: "Fixed the east gate" });
    expect(edited).toMatchObject({
      ok: true,
      entry: { body: "Fixed the east gate", people: [benBirch] },
    });
  });

  it("can't be changed by anyone else", async () => {
    const entry = await post({ body: "Fixed the gate" });
    expect(await editLogEntry("c1", entry.id, ben, { people: [benBirch] })).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("must be residents' ids or names, and an edit must change something", () => {
    expect(
      logInputSchema.safeParse({ body: "x", people: [{ personId: "nope", name: "X" }] }).success
    ).toBe(false);
    expect(logInputSchema.safeParse({ body: "x", people: [{ name: " " }] }).success).toBe(false);
    expect(logUpdateSchema.safeParse({}).success).toBe(false);
    expect(logUpdateSchema.safeParse({ people: [] }).success).toBe(true);
  });
});
