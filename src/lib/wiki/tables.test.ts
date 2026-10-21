import { describe, expect, it } from "vitest";
import {
  evenShares,
  formatWidths,
  parseWidths,
  pixelsOf,
  remarkTableWidths,
  sharesOf,
} from "./tables";

describe("table column widths", () => {
  it("turns pixels into shares that sum to 100, and back", () => {
    expect(sharesOf([210, 490])).toEqual([30, 70]);
    expect(sharesOf([100, 100, 100])).toEqual([33.3, 33.3, 33.4]);
    expect(pixelsOf([30, 70])).toEqual([210, 490]);
    expect(formatWidths([33.3, 33.3, 33.4])).toBe("33.3,33.3,33.4");
    expect(formatWidths([30, 70])).toBe("30,70");
  });

  it("knows even columns need no widths", () => {
    expect(evenShares([33.3, 33.3, 33.4])).toBe(true);
    expect(evenShares([30, 70])).toBe(false);
    expect(evenShares([50])).toBe(true);
  });

  it("reads a widths attribute only when it fits the table", () => {
    expect(parseWidths("30,70", 2)).toEqual([30, 70]);
    expect(parseWidths("1,2", 2)).toEqual([33.3, 66.7]);
    expect(parseWidths("30,70", 3)).toBeNull();
    expect(parseWidths("30,abc", 2)).toBeNull();
    expect(parseWidths("", 2)).toBeNull();
  });

  it("gives a table the widths from the line before it, and drops the line", () => {
    const table = {
      type: "table",
      children: [{ type: "tableRow", children: [{ type: "tableCell" }, { type: "tableCell" }] }],
    };
    const tree = {
      type: "root",
      children: [
        { type: "leafDirective", name: "columns", attributes: { widths: "25,75" } },
        table,
        { type: "leafDirective", name: "columns", attributes: { widths: "50,50" } },
        { type: "paragraph", children: [] },
      ],
    };
    remarkTableWidths()(tree);
    expect(tree.children.map((node) => node.type)).toEqual(["table", "paragraph"]);
    expect((table as { data?: { hProperties?: unknown } }).data?.hProperties).toEqual({
      dataWidths: "25,75",
    });
  });
});
