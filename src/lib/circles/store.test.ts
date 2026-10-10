import { describe, expect, it } from "vitest";
import { modulesSchema } from "./store";

const finances = { id: "finances", type: "finances", size: "full" };
const messages = (value: unknown) => {
  const parsed = modulesSchema.safeParse(value);
  return parsed.success ? [] : parsed.error.errors.map((error) => error.message);
};

describe("modulesSchema", () => {
  it("keeps who can see a Finances module, and leaves it unset by default", () => {
    expect(modulesSchema.parse([{ ...finances, finances: { view: "members" } }])).toEqual([
      { ...finances, finances: { view: "members" } },
    ]);
    expect(modulesSchema.parse([finances])).toEqual([finances]);
  });

  it("refuses that setting anywhere else, or a setting it doesn't know", () => {
    expect(
      messages([{ id: "log", type: "log", size: "full", finances: { view: "members" } }])
    ).toEqual(["Only a Finances module says who can see it"]);
    expect(messages([{ ...finances, finances: { view: "anyone" } }])).toHaveLength(1);
  });

  it("allows one Finances module on a page", () => {
    expect(messages([finances, { ...finances, id: "finances-2" }])).toEqual([
      "Members, the duty schedule, tasks, the forum, the log, finances, documents, and sub groups can each appear once",
    ]);
  });
});
