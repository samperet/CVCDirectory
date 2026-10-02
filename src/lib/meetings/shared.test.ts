import { describe, expect, it } from "vitest";
import {
  formatDuration,
  openObjections,
  proposalState,
  reviewTimeLeft,
  statusLine,
  type Proposal,
  type ProposalComment,
} from "./shared";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.parse("2026-10-02T12:00:00Z");

const proposal = (
  review: Proposal["review"],
  rest: Partial<Proposal> = {}
): Pick<Proposal, "review" | "consentedAt" | "withdrawnAt"> => ({
  review,
  consentedAt: null,
  withdrawnAt: null,
  ...rest,
});
const running = {
  startedAt: new Date(now - DAY).toISOString(),
  deadline: new Date(now + 4 * DAY).toISOString(),
  remainingMs: null,
};
const paused = {
  startedAt: new Date(now - DAY).toISOString(),
  deadline: null,
  remainingMs: 3 * DAY,
};
const over = {
  startedAt: new Date(now - 6 * DAY).toISOString(),
  deadline: new Date(now - DAY).toISOString(),
  remainingMs: null,
};

describe("proposalState", () => {
  it("is a draft until sent for review", () =>
    expect(proposalState(proposal(null), now)).toBe("draft"));
  it("is in review while the deadline is ahead", () =>
    expect(proposalState(proposal(running), now)).toBe("review"));
  it("is paused while an objection holds the clock", () =>
    expect(proposalState(proposal(paused), now)).toBe("paused"));
  it("is consented once the deadline has passed, without anyone acting", () =>
    expect(proposalState(proposal(over), now)).toBe("consented"));
  it("stays consented once recorded", () =>
    expect(
      proposalState(proposal(running, { consentedAt: new Date(now).toISOString() }), now)
    ).toBe("consented"));
  it("is withdrawn whatever the clock says", () =>
    expect(
      proposalState(proposal(running, { withdrawnAt: new Date(now).toISOString() }), now)
    ).toBe("withdrawn"));
});

describe("reviewTimeLeft", () => {
  it("counts down while running", () =>
    expect(reviewTimeLeft(proposal(running), now)).toBe(4 * DAY));
  it("holds the time left while paused", () =>
    expect(reviewTimeLeft(proposal(paused), now)).toBe(3 * DAY));
  it("has none once over", () => expect(reviewTimeLeft(proposal(over), now)).toBeNull());
});

describe("formatDuration", () => {
  it("rounds up to whole minutes", () => expect(formatDuration(10_000)).toBe("1 minute"));
  it("names hours and minutes", () =>
    expect(formatDuration(90 * 60_000)).toBe("1 hour 30 minutes"));
  it("names days and hours", () =>
    expect(formatDuration(2 * DAY + 3 * HOUR)).toBe("2 days 3 hours"));
  it("leaves out an empty smaller unit", () => expect(formatDuration(DAY)).toBe("1 day"));
});

describe("statusLine", () => {
  it("says what's left in review", () =>
    expect(statusLine(proposal(running), 0, now)).toBe("4 days left"));
  it("counts the objections holding a paused review", () =>
    expect(statusLine(proposal(paused), 2, now)).toBe("Paused: 2 objections"));
  it("names the other states", () => expect(statusLine(proposal(over), 0, now)).toBe("Consented"));
});

describe("openObjections", () => {
  const comment = (
    kind: ProposalComment["kind"],
    extra: Partial<ProposalComment> = {}
  ): ProposalComment => ({
    id: Math.random().toString(),
    parentId: null,
    kind,
    authorId: "u",
    authorPersonId: null,
    authorName: "A",
    body: "…",
    createdAt: new Date(now).toISOString(),
    ...extra,
  });
  it("counts objections not yet withdrawn, not replies or tensions", () => {
    const comments = [
      comment("objection"),
      comment("objection", { withdrawnAt: new Date(now).toISOString() }),
      comment("objection", { parentId: "x" }),
      comment("tension"),
    ];
    expect(openObjections({ comments })).toHaveLength(1);
  });
});
