import { describe, expect, it } from "vitest";
import { BUILT_IN_TEMPLATES, builtInTemplate, fillTemplate } from "./templates";
import { markdownToProse, proseToMarkdown, rewriteMarkdown } from "./prose";

describe("templates", () => {
  const values = { date: "Oct 11, 2026", circle: "Land Care Circle" };

  it("fills in the day and the circle, however they're spaced", () => {
    expect(fillTemplate("{{circle}} meeting, {{ date }}", values)).toBe(
      "Land Care Circle meeting, Oct 11, 2026"
    );
  });

  it("leaves out the template page's polls and proposals", () => {
    const body =
      'Before\n\n::poll{#11111111-2222-4333-8444-555555555555}\n\n::proposal{id="abc"}\n\nAfter\n';
    expect(fillTemplate(body, values)).toBe("Before\n\nAfter\n");
  });

  it("keeps embedded pages and everything else", () => {
    const body = '::embed{page="Mowing"}\n\n:::callout\nHi\n:::\n';
    expect(fillTemplate(body, values)).toBe(body);
  });

  it("has the four built in, each a page the editor writes back unchanged", () => {
    expect(BUILT_IN_TEMPLATES.map((template) => template.key)).toEqual([
      "meeting-agenda",
      "meeting-notes",
      "policy",
      "how-to",
    ]);
    for (const template of BUILT_IN_TEMPLATES) {
      const filled = fillTemplate(template.body, values);
      expect(proseToMarkdown(markdownToProse(filled))).toBe(rewriteMarkdown(filled));
      expect(filled).not.toContain("{{");
    }
    expect(builtInTemplate("policy")?.name).toBe("Policy");
    expect(builtInTemplate("nope")).toBeUndefined();
  });
});
