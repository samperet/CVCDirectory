import { describe, expect, it } from "vitest";
import { readUnsubscribeToken, unsubscribeToken } from "./unsubscribe";

describe("unsubscribe tokens", () => {
  it("say who and what", () => {
    expect(readUnsubscribeToken(unsubscribeToken("a1b2c3d4e5f6", "photos"))).toEqual({
      personId: "a1b2c3d4e5f6",
      scope: "photos",
    });
    expect(readUnsubscribeToken(unsubscribeToken("a1b2c3d4e5f6", "all"))?.scope).toBe("all");
  });
  it("can't be changed or made up", () => {
    const token = unsubscribeToken("a1b2c3d4e5f6", "photos");
    expect(readUnsubscribeToken(token.replace("photos", "replies"))).toBeNull();
    expect(readUnsubscribeToken(token.replace("a1b2c3d4e5f6", "ffffffffffff"))).toBeNull();
    expect(readUnsubscribeToken("a1b2c3d4e5f6.photos.forged")).toBeNull();
    expect(readUnsubscribeToken("")).toBeNull();
    expect(readUnsubscribeToken(`${token}.extra`)).toBeNull();
  });
});
