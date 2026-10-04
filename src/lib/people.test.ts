import { describe, expect, it } from "vitest";
import { namedPeopleSchema, namesOf } from "./people";

describe("named people", () => {
  it("read as a list", () => {
    expect(namesOf([])).toBe("");
    expect(namesOf([{ name: "Ada Ash" }])).toBe("Ada Ash");
    expect(namesOf([{ name: "Ada Ash" }, { name: "Ben Birch" }])).toBe("Ada Ash and Ben Birch");
    expect(namesOf([{ name: "Ada Ash" }, { name: "Ben Birch" }, { name: "Sam" }])).toBe(
      "Ada Ash, Ben Birch and Sam"
    );
  });

  it("are residents by directory id, or anyone by name", () => {
    const schema = namedPeopleSchema(2, "Choose who consented");
    expect(schema.safeParse(undefined).error?.errors[0].message).toBe("Choose who consented");
    expect(schema.safeParse([{ personId: "000000000001", name: "Ada Ash" }]).success).toBe(true);
    expect(schema.safeParse([{ name: "The plumber" }]).success).toBe(true);
    expect(schema.safeParse([]).success).toBe(false);
    expect(schema.safeParse([{ personId: "ada", name: "Ada Ash" }]).success).toBe(false);
    expect(schema.safeParse([{ name: "A" }, { name: "B" }, { name: "C" }]).success).toBe(false);
  });
});
