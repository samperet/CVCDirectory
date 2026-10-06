import { describe, expect, it } from "vitest";
import { toPublicUser } from "./users";

describe("toPublicUser", () => {
  const now = new Date("2026-10-06T12:00:00Z").getTime();
  const base = { id: "u1", name: "Ada Ash", personId: "000000000001" };
  it("says whether the welcome tour is done, and whether the account is new", () => {
    expect(toPublicUser({ ...base, createdAt: "2026-10-06T08:00:00Z" }, now)).toMatchObject({
      tourSeen: false,
      newAccount: true,
    });
    expect(
      toPublicUser(
        { ...base, createdAt: "2026-09-01T08:00:00Z", tourSeenAt: "2026-09-01T08:05:00Z" },
        now
      )
    ).toMatchObject({ tourSeen: true, newAccount: false });
  });
});
