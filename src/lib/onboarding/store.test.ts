import { beforeEach, describe, expect, it, vi } from "vitest";

// The invitations, in memory.
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
const secretary = { personId: "000000000002", name: "Ben Birch" };
const answers = {
  firstName: "Gil",
  lastName: "Gum",
  phone: "(802) 555-0199",
  unit: 7,
  bio: "We wanted our kids to grow up knowing their neighbors.",
};

async function invite(email = "gil@example.org", now = new Date()) {
  const result = await store.createInvitation(secretary, { email, name: "Gil Gum" }, now);
  if (!result.ok) throw new Error(result.reason);
  return result.invitation;
}

beforeEach(() => docs.clear());

describe("invitations", () => {
  it("are one at a time for an address, until that person is added", async () => {
    const first = await invite();
    expect(await store.createInvitation(secretary, { email: first.email, name: null })).toEqual({
      ok: false,
      reason: "already_invited",
    });
    await store.markAdded(first.id, "0123456789ab");
    expect((await store.createInvitation(secretary, { email: first.email, name: null })).ok).toBe(
      true
    );
  });

  it("take answers, which can change until they're added", async () => {
    const invitation = await invite();
    const parsed = store.answersSchema.parse(answers);
    expect(parsed.phone).toBe("802-555-0199");
    const saved = await store.saveAnswers(invitation.id, parsed);
    expect(saved.ok && saved.invitation.answers).toMatchObject({ firstName: "Gil", unit: 7 });
    const changed = await store.saveAnswers(invitation.id, { ...parsed, unit: null });
    expect(changed.ok && changed.invitation.answers?.unit).toBeNull();
    await store.markAdded(invitation.id, "0123456789ab");
    expect(await store.saveAnswers(invitation.id, parsed)).toEqual({
      ok: false,
      reason: "already_added",
    });
  });

  it("stop taking answers when the link expires, until it's sent again", async () => {
    const invitation = await invite("gil@example.org", new Date("2026-01-01T00:00:00Z"));
    const parsed = store.answersSchema.parse(answers);
    const late = new Date("2026-03-03T00:00:00Z");
    expect(await store.saveAnswers(invitation.id, parsed, late)).toEqual({
      ok: false,
      reason: "expired",
    });
    await store.markSent(invitation.id, new Date("2026-03-02T00:00:00Z"));
    expect((await store.saveAnswers(invitation.id, parsed, late)).ok).toBe(true);
  });

  it("can be removed", async () => {
    const invitation = await invite();
    expect(await store.removeInvitation(invitation.id)).toBe(true);
    expect(await store.getInvitation(invitation.id)).toBeNull();
    expect(await store.removeInvitation(invitation.id)).toBe(false);
  });
});

describe("answers", () => {
  it("need a bio, a full name, and a mobile number that can sign in", () => {
    expect(store.answersSchema.safeParse({ ...answers, bio: " " }).success).toBe(false);
    expect(store.answersSchema.safeParse({ ...answers, lastName: "" }).success).toBe(false);
    expect(store.answersSchema.safeParse({ ...answers, phone: "555-0199" }).success).toBe(false);
    expect(store.answersSchema.safeParse({ ...answers, bio: "x".repeat(501) }).success).toBe(false);
    expect(store.answersSchema.parse({ ...answers, unit: undefined }).unit).toBeNull();
  });
});
