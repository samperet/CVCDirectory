import { describe, expect, it } from "vitest";
import { mergeText, splitBlocks } from "./merge";

const base = "# Title\n\nPara one.\n\nPara two.\n\nPara three.\n";

describe("splitBlocks", () => {
  it("keeps code fences, ::: sections, and directives whole", () => {
    const blocks = splitBlocks(
      'a\n\n```\ncode\n\nmore\n```\n\n:::details{title="x"}\nin\n\nside\n:::\n\n::poll{id="p"}\n\nend'
    );
    expect(blocks).toEqual([
      "a",
      "```\ncode\n\nmore\n```",
      ':::details{title="x"}\nin\n\nside\n:::',
      '::poll{id="p"}',
      "end",
    ]);
  });
});

describe("mergeText", () => {
  it("keeps changes to different paragraphs", () => {
    const result = mergeText(
      base,
      base.replace("Para one.", "Para one, mine."),
      base.replace("Para three.", "Para three, theirs.")
    );
    expect(result.text).toBe("# Title\n\nPara one, mine.\n\nPara two.\n\nPara three, theirs.\n");
    expect(result.conflicts).toEqual([]);
  });

  it("places their insertion above my edit, and says where my blocks landed", () => {
    const result = mergeText(
      base,
      base.replace("Para three.", "Para three!"),
      base.replace("# Title\n\n", "# Title\n\nNew intro.\n\n")
    );
    expect(result.text).toBe("# Title\n\nNew intro.\n\nPara one.\n\nPara two.\n\nPara three!\n");
    expect(result.mineAt).toEqual([0, 2, 3, 4]);
  });

  it("keeps mine and reports theirs when both edit the same paragraph", () => {
    const result = mergeText(
      base,
      base.replace("Para two.", "Two A."),
      base.replace("Para two.", "Two B.")
    );
    expect(result.conflicts).toEqual([{ mine: "Two A.", theirs: "Two B." }]);
    expect(result.text).toContain("Two A.");
  });

  it("keeps both when both add at the end, mine first", () => {
    const result = mergeText(base, `${base}\nMine end.\n`, `${base}\nTheirs end.\n`);
    expect(result.text.endsWith("Para three.\n\nMine end.\n\nTheirs end.\n")).toBe(true);
  });

  it("lets an edit beat a deletion", () => {
    const result = mergeText(
      base,
      base.replace("Para two.", "Two edited."),
      base.replace("Para two.\n\n", "")
    );
    expect(result.text).toContain("Two edited.");
    expect(result.conflicts).toEqual([]);
  });

  it("returns the other side exactly when one side didn't change", () => {
    expect(mergeText(base, base, "x\n\n\n\ny").text).toBe("x\n\n\n\ny");
  });

  it("keeps what one side appended after paragraphs the other edited (two people taking minutes)", () => {
    const theirs = mergeText(
      base,
      base.replace("Para three.", "Para three, edited."),
      `${base}\nAppended by them.\n`
    );
    expect(theirs.text).toBe(
      "# Title\n\nPara one.\n\nPara two.\n\nPara three, edited.\n\nAppended by them.\n"
    );
    expect(theirs.conflicts).toEqual([]);
    const mine = mergeText(
      base,
      `${base}\nAppended by me.\n`,
      base.replace("Para three.", "Para three, theirs.")
    );
    expect(mine.text).toBe(
      "# Title\n\nPara one.\n\nPara two.\n\nPara three, theirs.\n\nAppended by me.\n"
    );
    expect(mine.conflicts).toEqual([]);
  });

  it("still reports a clash when both edit the same paragraph and one adds after it", () => {
    const result = mergeText(
      base,
      base.replace("Para two.", "Two A."),
      `${base.replace("Para two.", "Two B.")}\nMore.\n`
    );
    expect(result.conflicts).toHaveLength(1);
  });
});
