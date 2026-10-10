import { beforeEach, describe, expect, it, vi } from "vitest";

/** Private messages: both people's lists kept up to date, unread, deleting your own, the cap. */

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

const store = await import("./store");
const { conversationId, isUnread, MAX_MESSAGES, unreadCount } = await import("./shared");
const ADA = "000000000001";
const BEN = "000000000002";
const ada = { userId: "u-ada", personId: ADA, name: "Ada Ash" };
const ben = { userId: "u-ben", personId: BEN, name: "Ben Birch" };
const at = (minute: number) => new Date(Date.UTC(2026, 9, 10, 12, minute));

beforeEach(() => docs.clear());

describe("messages", () => {
  it("is one conversation whichever way round", () => {
    expect(conversationId(BEN, ADA)).toBe(conversationId(ADA, BEN));
  });

  it("keeps both people's lists up to date, and what's unread", async () => {
    await store.sendMessage(ada, BEN, "Hello  Ben!\nAre you around?", at(1));
    const bens = await store.readIndex(BEN);
    expect(bens[ADA]).toMatchObject({
      with: ADA,
      lastFrom: ADA,
      lastExcerpt: "Hello Ben! Are you around?",
    });
    expect(unreadCount(bens, BEN)).toBe(1);
    expect(unreadCount(await store.readIndex(ADA), ADA)).toBe(0);
    // Reading it: written once.
    expect(isUnread((await store.markRead(BEN, ADA, at(2)))!, BEN)).toBe(false);
    const read = (await store.readIndex(BEN))[ADA];
    expect(await store.markRead(BEN, ADA, at(3))).toEqual(read);
    // A reply is unread for Ada.
    await store.sendMessage(ben, ADA, "Yes!", at(4));
    expect(unreadCount(await store.readIndex(ADA), ADA)).toBe(1);
    expect((await store.readMessages(BEN, ADA)).map((message) => message.body)).toEqual([
      "Hello  Ben!\nAre you around?",
      "Yes!",
    ]);
  });

  it("deletes only your own messages, and the lists follow", async () => {
    const first = await store.sendMessage(ada, BEN, "One", at(1));
    const second = await store.sendMessage(ada, BEN, "Two", at(2));
    expect(await store.deleteMessage(ben, ADA, second.id)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await store.deleteMessage(ada, BEN, second.id, at(3))).toEqual({ ok: true });
    expect((await store.readIndex(BEN))[ADA]).toMatchObject({
      lastExcerpt: "One",
      lastAt: first.createdAt,
    });
    await store.deleteMessage(ada, BEN, first.id, at(4));
    const bens = await store.readIndex(BEN);
    expect(bens[ADA]).toMatchObject({ lastAt: null, lastExcerpt: "" });
    expect(unreadCount(bens, BEN)).toBe(0);
  });

  it("keeps the latest messages", async () => {
    docs.set(`chat/conversations/${conversationId(ADA, BEN)}.json`, {
      messages: Array.from({ length: MAX_MESSAGES }, (_, i) => ({
        id: `m${i}`,
        parentId: null,
        authorId: "u-ada",
        authorPersonId: ADA,
        authorName: "Ada Ash",
        body: `#${i}`,
        createdAt: at(0).toISOString(),
      })),
    });
    await store.sendMessage(ben, ADA, "Newest", at(5));
    const messages = await store.readMessages(ADA, BEN);
    expect(messages).toHaveLength(MAX_MESSAGES);
    expect(messages[0].body).toBe("#1");
    expect(messages.at(-1)!.body).toBe("Newest");
  });
});
