import { describe, expect, it } from "vitest";
import { todoItems, toggleTodo } from "./todos";

const page = `# Spring

- [ ] Order seed
- [x] Mow the **meadow**
  - [ ] Edges too
- Not a to-do

:::callout
1. [ ] Fix the [[Gate]]
:::
`;

describe("to-do lists", () => {
  it("finds the to-do items in order, nested and in callouts too", () => {
    expect(todoItems(page)).toEqual([
      { checked: false, text: "Order seed" },
      { checked: true, text: "Mow the meadow" },
      { checked: false, text: "Edges too" },
      { checked: false, text: "Fix the [[Gate]]" },
    ]);
  });

  it("ticks and unticks one, leaving the rest as written", () => {
    const ticked = toggleTodo(page, 0, true, "Order seed")!;
    expect(ticked).toContain("- [x] Order seed");
    expect(ticked.replace("- [x] Order seed", "- [ ] Order seed")).toBe(page);
    expect(toggleTodo(page, 1, false, "Mow the meadow")).toContain("- [ ] Mow the **meadow**");
    expect(toggleTodo(page, 2, true, "Edges too")).toContain("  - [x] Edges too");
    expect(toggleTodo(page, 3, true, "Fix the [[Gate]]")).toContain("1. [x] Fix the [[Gate]]");
  });

  it("refuses an item that isn't there, or has changed", () => {
    expect(toggleTodo(page, 9, true, "Order seed")).toBeNull();
    expect(toggleTodo(page, 0, true, "Order more seed")).toBeNull();
  });
});
