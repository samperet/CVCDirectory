import { describe, expect, it } from "vitest";
import { matchesIn } from "./find";

describe("find", () => {
  it("finds every appearance, in any case unless asked", () => {
    expect(matchesIn("Mow the meadow. MOW it again.", "mow", false)).toEqual([
      [0, 3],
      [16, 19],
    ]);
    expect(matchesIn("Mow the meadow. MOW it again.", "MOW", true)).toEqual([[16, 19]]);
  });

  it("takes the words as written, not as a pattern", () => {
    expect(matchesIn("Costs (est.) $1.50 or $1x50", "$1.50", false)).toEqual([[13, 18]]);
    expect(matchesIn("a+b and a+b", "a+b", false)).toHaveLength(2);
    expect(matchesIn("[[Page]]", "[[", false)).toEqual([[0, 2]]);
  });

  it("doesn't overlap, and finds nothing for nothing", () => {
    expect(matchesIn("aaaa", "aa", false)).toEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(matchesIn("anything", "", false)).toEqual([]);
  });
});
