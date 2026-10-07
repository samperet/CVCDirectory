import { describe, expect, it } from "vitest";
import { allowance } from "./quota";

describe("free quota", () => {
  const state = { day: "2026-10-04", dayCount: 60, month: "2026-10", monthCount: 2990 };
  it("gives direct email the whole day, notifications 70%, within the month", () => {
    expect(allowance({ ...state, monthCount: 0 }, 50, "direct", { day: 100, month: 3000 })).toBe(
      40
    );
    expect(
      allowance({ ...state, monthCount: 0 }, 50, "notifications", { day: 100, month: 3000 })
    ).toBe(10);
    expect(allowance(state, 50, "direct", { day: 100, month: 3000 })).toBe(10);
  });
});
