import { describe, expect, it } from "vitest";
import { moduleTitle, modulesFor, type CircleModule } from "./layout";

const types = (modules: CircleModule[]) => modules.map((module) => module.type);

describe("modulesFor", () => {
  it("uses the modules a circle saved, as they are", () => {
    const modules: CircleModule[] = [{ id: "tasks", type: "tasks", size: "full" }];
    expect(modulesFor({ id: "lcc", modules }, { hasSchedule: true })).toBe(modules);
  });

  it("derives a page for a circle that never saved one: its own pages, members, meetings, tasks, documents", () => {
    const modules = modulesFor({ id: "lcc" }, { hasSchedule: false });
    expect(types(modules)).toEqual(["information", "members", "meetings", "tasks", "documents"]);
    expect(modules[0].info).toEqual({ filter: { kind: "circle", circleId: "lcc" }, view: "summary" });
  });

  it("leaves out what the circle had turned off, and adds a duty schedule where there is one", () => {
    const modules = modulesFor({ id: "lcc", features: { tasks: false, documents: false } }, { hasSchedule: true });
    expect(types(modules)).toEqual(["information", "members", "meetings", "schedule"]);
  });

  it("keeps the order and sizes of an older layout, then the rest as they come by default", () => {
    const modules = modulesFor({ id: "lcc", layout: [{ id: "documents", size: "small" }, { id: "information", size: "full" }], infoView: "titles" }, { hasSchedule: false });
    expect(modules.map((module) => [module.type, module.size])).toEqual([
      ["documents", "small"],
      ["information", "full"],
      ["members", "small"],
      ["meetings", "full"],
      ["tasks", "full"],
    ]);
    expect(modules[1].info?.view).toBe("titles");
  });

  it("gives Community no members or meetings (it's everyone)", () => {
    expect(types(modulesFor({ id: "community" }, { hasSchedule: false }))).toEqual(["information", "tasks", "documents"]);
  });
});

describe("moduleTitle", () => {
  it("prefers the module's own title, then a schedule's name, then the type's name", () => {
    expect(moduleTitle({ type: "information", title: "Stove" })).toBe("Stove");
    expect(moduleTitle({ type: "information", title: "  " })).toBe("Information");
    expect(moduleTitle({ type: "schedule" }, "Chicken duty")).toBe("Chicken duty");
    expect(moduleTitle({ type: "schedule" })).toBe("Duty schedule");
  });
});
