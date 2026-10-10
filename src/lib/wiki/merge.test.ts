import { describe, expect, it } from "vitest";
import { compareRows, compareText, mergeText, splitBlocks } from "./merge";

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

describe("splitBlocks", () => {
  it("keeps a paragraph with highlighted text as one block", () => {
    expect(splitBlocks('Mow the :mark[east field]{color="green"}.\n\nThen rest.')).toEqual([
      'Mow the :mark[east field]{color="green"}.',
      "Then rest.",
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

describe("compareText", () => {
  it("keeps what's the same, and shows what was taken out and put in, in reading order", () => {
    const before = "# Mowing\n\nMow monthly.\n\n- east field\n- west field\n\nThanks.";
    const after =
      "# Mowing\n\nMow twice a month.\n\n- east field\n- west field\n\nAsk Ben first.\n\nThanks.";
    expect(compareText(before, after)).toEqual([
      { change: "same", text: "# Mowing" },
      { change: "removed", text: "Mow monthly." },
      { change: "added", text: "Mow twice a month." },
      { change: "same", text: "- east field\n- west field" },
      { change: "added", text: "Ask Ben first." },
      { change: "same", text: "Thanks." },
    ]);
  });
  it("is all the same for the same text, and all new from nothing", () => {
    expect(compareText("One.\n\nTwo.", "One.\n\nTwo.").every((b) => b.change === "same")).toBe(
      true
    );
    expect(compareText("", "One.\n\nTwo.")).toEqual([
      { change: "added", text: "One." },
      { change: "added", text: "Two." },
    ]);
    expect(compareText("Gone.", "")).toEqual([{ change: "removed", text: "Gone." }]);
  });
});

describe("compareRows", () => {
  it("lines up what's the same, and pairs what one took out with what the other put in", () => {
    const before = "# Mowing\n\nMow monthly.\n\nOnly the east field.\n\nThanks.\n";
    const after = "# Mowing\n\nMow twice a month.\n\nThanks.\n\nAsk Ben first.\n";
    expect(compareRows(before, after)).toEqual([
      { change: "same", before: "# Mowing", after: "# Mowing" },
      { change: "edited", before: "Mow monthly.", after: "Mow twice a month." },
      { change: "removed", before: "Only the east field.", after: null },
      { change: "same", before: "Thanks.", after: "Thanks." },
      { change: "added", before: null, after: "Ask Ben first." },
    ]);
  });

  it("pairs each paragraph with the one most like it, whatever the order", () => {
    const before = "Keep the paths clear.\n\nLeave the west field wild.\n\nThanks, all.\n";
    const after = "Keep the paths clear.\n\nThanks, everyone.\n";
    expect(compareRows(before, after)).toEqual([
      { change: "same", before: "Keep the paths clear.", after: "Keep the paths clear." },
      { change: "removed", before: "Leave the west field wild.", after: null },
      { change: "edited", before: "Thanks, all.", after: "Thanks, everyone." },
    ]);
    // Put in before, and nothing alike: still a row each, in reading order.
    expect(compareRows("One.\n\nTwo.", "New.\n\nOther.\n\nTwo.").map((row) => row.change)).toEqual([
      "edited",
      "added",
      "same",
    ]);
  });

  it("is all the same for the same text", () => {
    expect(compareRows("One.\n\nTwo.", "One.\n\nTwo.").map((row) => row.change)).toEqual([
      "same",
      "same",
    ]);
    expect(compareRows("", "")).toEqual([]);
  });
});
