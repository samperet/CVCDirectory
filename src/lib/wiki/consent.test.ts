import { describe, expect, it } from "vitest";
import { byDecision, consentState, pageStage } from "./consent";
import { pageUpdateSchema } from "./store";

const consent = {
  date: "2026-09-03",
  recordedBy: { userId: "u", name: "Cara Cedar" },
  recordedAt: "2026-09-03T15:00:00.000Z",
  version: "2026-09-01T10:00:00.000Z",
};

describe("consentState", () => {
  it("is null without consent", () => {
    expect(consentState({ updatedAt: "x" })).toBeNull();
    expect(consentState({ consent: null, updatedAt: "x" })).toBeNull();
  });
  it("is consented while the consented version is current", () => {
    expect(consentState({ consent, updatedAt: consent.version })).toBe("consented");
  });
  it("is changed once the page is edited again", () => {
    expect(consentState({ consent, updatedAt: "2026-09-10T10:00:00.000Z" })).toBe("changed");
  });
});

describe("pageStage", () => {
  const proposal = { by: { userId: "u", name: "Cara Cedar" }, at: "2026-09-02T10:00:00.000Z" };
  it("is a draft until proposed", () => {
    expect(pageStage({ updatedAt: "x" })).toBe("draft");
    expect(pageStage({ proposal, updatedAt: "x" })).toBe("proposed");
  });
  it("is consented while the consented version is current", () => {
    expect(pageStage({ consent, updatedAt: consent.version })).toBe("consented");
  });
  it("is a draft again once a consented page is edited, until proposed", () => {
    const edited = { consent, updatedAt: "2026-09-10T10:00:00.000Z" };
    expect(pageStage(edited)).toBe("draft");
    expect(pageStage({ ...edited, proposal })).toBe("proposed");
  });
});

describe("byDecision", () => {
  const by = { userId: "u", name: "Cara Cedar" };
  it("puts the soonest to be decided first, then the newest proposed", () => {
    const pages = [
      { id: "undated-old", proposal: { by, at: "2026-09-01T00:00:00.000Z" } },
      { id: "late", proposal: { by, at: "2026-09-01T00:00:00.000Z", decideOn: "2026-11-01" } },
      { id: "undated-new", proposal: { by, at: "2026-09-05T00:00:00.000Z" } },
      { id: "soon", proposal: { by, at: "2026-09-02T00:00:00.000Z", decideOn: "2026-10-10" } },
    ];
    expect([...pages].sort(byDecision).map((page) => page.id)).toEqual([
      "soon",
      "late",
      "undated-new",
      "undated-old",
    ]);
  });
});

describe("consent on a page", () => {
  it("is recorded through a proposal now: the page only takes withdrawing an old record", () => {
    expect(
      pageUpdateSchema.safeParse({
        consent: { date: "2026-10-03", consentedBy: [{ name: "Cara Cedar" }] },
      }).success
    ).toBe(false);
    expect(pageUpdateSchema.safeParse({ proposal: { decideOn: null } }).success).toBe(false);
    expect(pageUpdateSchema.safeParse({ consent: null }).success).toBe(true);
    expect(pageUpdateSchema.safeParse({ proposal: null }).success).toBe(true);
  });
  it("takes a meeting's day", () => {
    expect(pageUpdateSchema.safeParse({ meetingDate: "2026-10-08" }).success).toBe(true);
    expect(pageUpdateSchema.safeParse({ meetingDate: "Oct 8" }).success).toBe(false);
    expect(pageUpdateSchema.safeParse({ meetingDate: null }).success).toBe(true);
  });
});
