import { describe, expect, it } from "vitest";
import { hasAlert } from "./features";

describe("hasAlert", () => {
  it("is true for the Safety Crew, and for a circle with an Alert module placed before", () => {
    expect(hasAlert({ name: "Safety Crew" })).toBe(true);
    expect(hasAlert({ name: "CLC Safety & Emergency", modules: [] })).toBe(true);
    expect(
      hasAlert({ name: "Land Care", modules: [{ id: "alert", type: "alert", size: "full" }] })
    ).toBe(true);
    expect(hasAlert({ name: "Land Care", modules: [] })).toBe(false);
    expect(hasAlert(undefined)).toBe(false);
  });
});
