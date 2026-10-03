import { describe, expect, it } from "vitest";
import { consentState, pageStage } from "./consent";

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
