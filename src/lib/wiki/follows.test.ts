import { beforeEach, describe, expect, it, vi } from "vitest";

/** Following pages and mentioning residents: who's told, and how often. */

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
}));
const sent: { topic: string; onlyUserIds?: string[]; exceptUserId: string | null }[] = [];
vi.mock("@/lib/push/notify", () => ({
  notify: async (message: (typeof sent)[number]) => void sent.push(message),
}));
vi.mock("@/lib/auth/users", () => ({
  userIdsForPeople: async (ids: string[]) => ids.map((id) => `u-${id}`),
}));

const follows = await import("./follows");
const mentions = await import("./mentions");

const page = {
  id: "p1",
  slug: "mowing",
  title: "Mowing",
  body: "",
} as Parameters<typeof follows.tellFollowers>[0];
const cara = { userId: "u-cara", personId: "cara", name: "Cara Cedar" };

beforeEach(() => {
  docs.clear();
  sent.length = 0;
});

describe("following", () => {
  it("follows and unfollows", async () => {
    await follows.setFollowing("p1", "u-ada", true);
    await follows.setFollowing("p1", "u-ben", true);
    expect(await follows.isFollowing("p1", "u-ada")).toBe(true);
    expect(await follows.pagesFollowedBy("u-ben")).toEqual(["p1"]);
    await follows.setFollowing("p1", "u-ada", false);
    expect(await follows.isFollowing("p1", "u-ada")).toBe(false);
  });

  it("tells followers at most once an hour, never the one who changed it", async () => {
    await follows.setFollowing("p1", "u-ada", true);
    await follows.setFollowing("p1", "u-cara", true);
    await follows.tellFollowers(page, cara, "edited it");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      topic: "following",
      onlyUserIds: ["u-ada"],
      exceptUserId: "u-cara",
    });
    await follows.tellFollowers(page, cara, "edited it");
    expect(sent).toHaveLength(1);
    expect(await follows.claimTelling("p1", new Date(Date.now() + 61 * 60 * 1000))).toBe(true);
  });

  it("tells no one when only the editor follows", async () => {
    await follows.setFollowing("p1", "u-cara", true);
    await follows.tellFollowers(page, cara, "edited it");
    expect(sent).toHaveLength(0);
  });

  it("forgets pages gone for good, and accounts that closed", async () => {
    await follows.setFollowing("p1", "u-ada", true);
    await follows.setFollowing("p2", "u-ada", true);
    await follows.setFollowing("p2", "u-ben", true);
    await follows.forgetFollows({ pageIds: ["p1"], userIds: ["u-ben"] });
    expect(await follows.pagesFollowedBy("u-ada")).toEqual(["p2"]);
    expect(await follows.pagesFollowedBy("u-ben")).toEqual([]);
  });
});

describe("mentions", () => {
  it("tells each person mentioned once per page, never the one who mentioned them", async () => {
    const body = "Ask :person[Ada Ash]{#ada} and :person[Cara Cedar]{#cara}.";
    await mentions.tellMentioned({ ...page, body }, cara);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ topic: "mentions", onlyUserIds: ["u-ada"] });
    await mentions.tellMentioned({ ...page, body: `${body} And :person[Ben Birch]{#ben}.` }, cara);
    expect(sent[1].onlyUserIds).toEqual(["u-ben"]);
    await mentions.tellMentioned({ ...page, body }, cara);
    expect(sent).toHaveLength(2);
  });
});
