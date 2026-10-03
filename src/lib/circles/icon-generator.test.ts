import { describe, expect, it } from "vitest";
import { iconPrompt } from "./icon-generator";

describe("iconPrompt", () => {
  it("names the circle, says what it's for, and asks to match the references", () => {
    const prompt = iconPrompt(
      { name: "Beekeepers", description: "Looking after the hives by the orchard.", kind: "club" },
      4
    );
    expect(prompt).toContain('"Beekeepers" social club');
    expect(prompt).toContain("Looking after the hives by the orchard.");
    expect(prompt).toContain("The 4 reference images");
    expect(prompt).toContain("No text");
  });
  it("describes a style when there are no references", () => {
    const prompt = iconPrompt({ name: "Water", description: null, kind: "circle" }, 0);
    expect(prompt).not.toContain("reference images");
    expect(prompt).toContain("circle (working group)");
  });
});
