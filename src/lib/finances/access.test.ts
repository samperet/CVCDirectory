import { describe, expect, it } from "vitest";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { CircleModule } from "@/lib/circles/layout";
import { financeViewers, hasFinances } from "@/lib/circles/features";
import { canEditFinances, canSeeFinances, hiddenFinances } from "./access";

const ADA = "000000000001"; // on the Board
const CARA = "000000000003"; // in Land Care
const EVE = "000000000005"; // in neither
const FINN = "000000000006"; // an admin
const seat = (personId: string) => ({ personId, name: null, position: null, termEnds: null });
const directory = {
  circles: [
    { id: "board", name: "Board", seats: [seat(ADA)] },
    { id: "lcc", name: "Land Care Circle", seats: [seat(CARA)] },
    { id: "community", name: "Community", seats: [] },
  ],
} as unknown as DirectoryDocument;
const viewer = (personId: string | null, admin = false) => ({ personId, admin });

describe("who keeps a circle's finances", () => {
  it("is its members, the Board, and admins", () => {
    expect(canEditFinances(viewer(CARA), directory, "lcc")).toBe(true);
    expect(canEditFinances(viewer(ADA), directory, "lcc")).toBe(true);
    expect(canEditFinances(viewer(FINN, true), directory, "lcc")).toBe(true);
    expect(canEditFinances(viewer(EVE), directory, "lcc")).toBe(false);
    expect(canEditFinances(viewer(null), directory, "lcc")).toBe(false);
  });

  it("is never everyone: on Community, just the Board and admins", () => {
    expect(canEditFinances(viewer(ADA), directory, "community")).toBe(true);
    expect(canEditFinances(viewer(FINN, true), directory, "community")).toBe(true);
    expect(canEditFinances(viewer(CARA), directory, "community")).toBe(false);
    expect(canEditFinances(viewer(EVE), directory, "community")).toBe(false);
  });
});

describe("who can see them", () => {
  it("is everyone, unless the module keeps them to those who keep them", () => {
    expect(canSeeFinances("everyone", false)).toBe(true);
    expect(canSeeFinances("everyone", true)).toBe(true);
    expect(canSeeFinances("members", true)).toBe(true);
    expect(canSeeFinances("members", false)).toBe(false);
  });

  it("is told plainly who can, when they can't", () => {
    expect(hiddenFinances({ id: "lcc", name: "Land Care Circle" })).toBe(
      "Only Land Care Circle's members and the Board can see its finances."
    );
    expect(hiddenFinances({ id: "community", name: "Community" })).toBe(
      "Only the Board can see Community's finances."
    );
  });

  it("is read from the circle's Finances module: everyone unless it says members", () => {
    const finances = (setting?: CircleModule["finances"]): CircleModule => ({
      id: "finances",
      type: "finances",
      size: "full",
      ...(setting ? { finances: setting } : {}),
    });
    expect(financeViewers({ modules: [finances()] })).toBe("everyone");
    expect(financeViewers({ modules: [finances({ view: "members" })] })).toBe("members");
    expect(financeViewers({ modules: [finances({ view: "everyone" })] })).toBe("everyone");
    expect(hasFinances({ modules: [finances()] })).toBe(true);
    expect(hasFinances({ modules: [{ id: "log", type: "log", size: "full" }] })).toBe(false);
    expect(hasFinances({})).toBe(false);
    expect(hasFinances(undefined)).toBe(false);
  });
});
