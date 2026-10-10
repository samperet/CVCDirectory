import { beforeEach, describe, expect, it, vi } from "vitest";

/** Which notifications are also emailed: never a push-only topic, one marked `skipEmail`, or a test push. */

const emailed = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/email/send", () => ({
  emailNotification: async (message: { title: string }) => void emailed.push(message.title),
}));
vi.mock("./store", () => ({
  listSubscriptions: async () => [],
  allPreferences: async () => ({}),
  removeSubscriptions: async () => undefined,
  DEFAULT_PREFERENCES: {},
}));
vi.mock("./vapid", () => ({ vapidKeys: async () => ({}), vapidSubject: () => "" }));
vi.mock("web-push", () => ({ default: { sendNotification: async () => undefined } }));

const { notify } = await import("./notify");
const base = { body: "…", url: "/", exceptUserId: null };

beforeEach(() => void emailed.splice(0));

describe("notify", () => {
  it("emails a topic people can choose by email", async () => {
    await notify({ ...base, topic: "discussions", title: "A discussion" });
    expect(emailed).toEqual(["A discussion"]);
  });

  it("never emails a push-only topic, one marked skipEmail, or a test push", async () => {
    await notify({ ...base, topic: "groups", title: "A circle forum message" });
    await notify({ ...base, topic: "discussions", title: "Skipped", skipEmail: true });
    await notify({ ...base, topic: "discussions", title: "A test", ignorePreferences: true });
    expect(emailed).toEqual([]);
  });
});
