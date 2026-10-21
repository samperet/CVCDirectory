import { describe, expect, it } from "vitest";
import { graphCircles } from "./graph";

const circles = [
  { id: "board", name: "Board" },
  { id: "lcc", name: "Land Care Circle" },
  { id: "crew", name: "Safety Crew", parentId: "lcc" },
  { id: "omc", name: "O&M" },
];

describe("the circles on the map", () => {
  it("lists those keeping pages, a sub group with its parent, and the parent even without pages", () => {
    expect(graphCircles(circles, new Set(["crew", "omc"]))).toEqual([
      { id: "lcc", name: "Land Care Circle" },
      { id: "crew", name: "Safety Crew", parentId: "lcc" },
      { id: "omc", name: "O&M" },
    ]);
    expect(graphCircles(circles, new Set(["board"]))).toEqual([{ id: "board", name: "Board" }]);
    expect(graphCircles(circles, new Set())).toEqual([]);
  });
});
