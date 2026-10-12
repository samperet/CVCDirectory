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

  it("allows one Finances module on a page, and one Alert", () => {
    const once =
      "Members, the duty schedule, the forum, the log, finances, documents, sub groups, and the alert button can each appear once";
    expect(messages([finances, { ...finances, id: "finances-2" }])).toEqual([once]);
    const alert = { id: "alert", type: "alert", size: "full" };
    expect(modulesSchema.parse([alert])).toEqual([alert]);
    expect(messages([alert, { ...alert, id: "alert-2" }])).toEqual([once]);
  });

  it("allows several Tasks modules, each with its own view", () => {
    const tasks = {
      id: "tasks",
      type: "tasks",
      size: "full",
      tasks: { add: "members", view: { show: "open", whose: "everyone", due: "any" } },
    };
    const overdue = {
      ...tasks,
      id: "tasks-2",
      title: "Overdue",
      tasks: { add: "members", view: { show: "open", whose: "unassigned", due: "overdue" } },
    };
    expect(modulesSchema.parse([tasks, overdue])).toHaveLength(2);
    expect(
      messages([
        { ...tasks, tasks: { add: "members", view: { ...tasks.tasks.view, whose: "person" } } },
      ])
    ).toEqual(["Choose whose tasks it shows"]);
  });
});
