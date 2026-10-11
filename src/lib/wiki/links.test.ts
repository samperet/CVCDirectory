import { describe, expect, it } from "vitest";
import { unmark } from "./links";

describe("unmark", () => {
  it("keeps the words of highlighted text and drops the markup", () => {
    expect(unmark('Mow the :mark[east field]{color="green"} on Monday.')).toBe(
      "Mow the east field on Monday."
    );
    expect(unmark(':mark[a]{color="pink"} and :mark[b]{color="blue"}')).toBe("a and b");
  });
  it("copes with escaped characters and links in the words", () => {
    expect(unmark(':mark[a \\] b]{color="green"}')).toBe("a \\] b");
    expect(unmark(':mark[see [[Mowing]] now]{color="blue"}.')).toBe("see [[Mowing]] now.");
  });
  it("leaves other text alone", () => {
    expect(unmark("Contact:Lynn at [[Mowing]] — :other[x]{y}")).toBe(
      "Contact:Lynn at [[Mowing]] — :other[x]{y}"
    );
  });
});

describe("mentions", () => {
  it("finds the people a page mentions, each once, written either way", async () => {
    const { personIdsIn } = await import("./links");
    expect(
      personIdsIn(
        ':person[Ada Ash]{#000000000001} and :person[Ben Birch]{id="000000000002"} and :person[Ada Ash]{#000000000001}'
      )
    ).toEqual(["000000000001", "000000000002"]);
  });

  it("reads mentions as @Name in plain text", async () => {
    const { unperson } = await import("./links");
    expect(unperson("Ask :person[Ada Ash]{#000000000001} first.")).toBe("Ask @Ada Ash first.");
  });
});
