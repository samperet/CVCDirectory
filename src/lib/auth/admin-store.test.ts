import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admins added on the Admin settings page: beside those built in and set in
 * Vercel, known to `isAdmin` once added or read, and never the last one gone.
 */

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

const { addAdmin, listAdmins, loadAdmins, removeAdmin } = await import("./admin-store");
const { isAdmin, setAddedAdmins } = await import("./admins");

const ada = { userId: "u-ada", name: "Ada Ash" };
const ben = { personId: "000000000002" };
const cara = { personId: "000000000003" };

beforeEach(() => {
  docs.clear();
  setAddedAdmins([]);
  process.env.ADMIN_PERSON_IDS = "000000000001";
});

describe("admins added in the app", () => {
  it("are admins everywhere once added, listed after those built in and set in Vercel", async () => {
    expect(isAdmin(ben)).toBe(false);
    const added = await addAdmin(ben.personId, ada);
    expect(added.ok).toBe(true);
    expect(isAdmin(ben)).toBe(true);
    const admins = await listAdmins();
    expect(admins.map((admin) => admin.source)).toEqual(["built-in", "environment", "added"]);
    expect(admins.at(-1)).toMatchObject({ personId: ben.personId, addedBy: { name: "Ada Ash" } });
    expect(await addAdmin(ben.personId, ada)).toEqual({ ok: false, reason: "already" });
    expect(await addAdmin("000000000001", ada)).toEqual({ ok: false, reason: "already" });
  });

  it("are known to another server once it reads them", async () => {
    docs.set("auth/admins.json", {
      admins: [{ personId: cara.personId, addedAt: "2026-10-10T12:00:00.000Z", addedBy: ada }],
    });
    vi.useFakeTimers({ now: Date.now() + 60_000 });
    await loadAdmins();
    vi.useRealTimers();
    expect(isAdmin(cara)).toBe(true);
  });

  it("are removed here — but not those built in or set in Vercel", async () => {
    await addAdmin(ben.personId, ada);
    expect((await removeAdmin(ben.personId)).ok).toBe(true);
    expect(isAdmin(ben)).toBe(false);
    expect(await removeAdmin(ben.personId)).toEqual({ ok: false, reason: "not_added" });
    expect(await removeAdmin("000000000001")).toEqual({ ok: false, reason: "fixed" });
  });
});
