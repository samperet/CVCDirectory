import { describe, expect, it } from "vitest";
import { fileMirror, pageMirror } from "./mirror";
import { markMembers, meetingDateOf, proposalIdsIn, byDecision, type Proposal } from "./shared";
import { consentInputSchema, proposalInputSchema } from "./store";

const PAGE = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const cara = { userId: "u-cara", personId: "000000000003", name: "Cara Cedar" };

const proposal = (overrides: Partial<Proposal>): Proposal => ({
  id: "33333333-3333-4333-8333-333333333333",
  circleId: "lcc",
  title: "Adopt the mowing plan",
  body: "",
  documents: [
    { kind: "page", id: PAGE },
    { kind: "file", id: FILE },
  ],
  decideOn: "2026-10-20",
  status: "proposed",
  proposedBy: cara,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedBy: cara,
  updatedAt: "2026-10-01T12:00:00.000Z",
  consent: null,
  withdrawn: null,
  ...overrides,
});

const consented = proposal({
  id: "44444444-4444-4444-8444-444444444444",
  status: "consented",
  consent: {
    meeting: {
      kind: "page",
      id: "55555555-5555-4555-8555-555555555555",
      title: "Land Care meeting, Oct 8",
      date: "2026-10-08",
      circleId: "lcc",
      href: "/wiki/land-care-meeting-oct-8",
    },
    circleId: "lcc",
    present: [
      { personId: "000000000003", name: "Cara Cedar", member: true },
      { name: "Sam", member: false },
    ],
    note: null,
    submittedBy: cara,
    submittedAt: "2026-10-08T20:00:00.000Z",
    documents: [
      { kind: "page", id: PAGE, version: "2026-10-05T10:00:00.000Z" },
      { kind: "file", id: FILE, version: "2" },
    ],
  },
});

describe("proposals in pages", () => {
  it("are found by their directive, each once", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(
      proposalIdsIn(`Intro\n::proposal{id="${id}"}\n\n::proposal{id="${id.toUpperCase()}"}\ntext`)
    ).toEqual([id]);
    expect(proposalIdsIn("::proposal{id=nope}")).toEqual([]);
  });
});

describe("what a page or file shows of its proposals", () => {
  it("is proposed while an open proposal is about it", () => {
    const shown = pageMirror({ id: PAGE }, [proposal({})]);
    expect(shown.proposal).toMatchObject({
      proposalId: proposal({}).id,
      decideOn: "2026-10-20",
      circleId: "lcc",
    });
    expect(shown.consent).toBeNull();
  });
  it("is consented at the version the meeting consented, by the members who were there", () => {
    const shown = pageMirror({ id: PAGE }, [consented]);
    expect(shown.proposal).toBeNull();
    expect(shown.consent).toMatchObject({
      date: "2026-10-08",
      version: "2026-10-05T10:00:00.000Z",
      consentedBy: [{ personId: "000000000003", name: "Cara Cedar" }],
      proposalId: consented.id,
    });
    expect(fileMirror({ id: FILE }, [consented]).consent).toMatchObject({ version: 2 });
  });
  it("keeps a record from before proposals until a proposal takes its place", () => {
    const old = {
      date: "2026-09-01",
      recordedBy: { userId: "u", name: "Ada Ash" },
      recordedAt: "2026-09-01T12:00:00.000Z",
      version: "v1",
    };
    expect(pageMirror({ id: PAGE, consent: old }, []).consent).toBe(old);
    expect(pageMirror({ id: PAGE, consent: old }, [consented]).consent?.proposalId).toBe(
      consented.id
    );
    // A copy of a proposal that's gone (or withdrawn) is cleared.
    expect(
      pageMirror({ id: PAGE, consent: { ...old, proposalId: "gone" } }, []).consent
    ).toBeNull();
    expect(pageMirror({ id: PAGE }, [proposal({ status: "withdrawn" })]).proposal).toBeNull();
  });
});

describe("meetings", () => {
  it("mark who was in the circle", () => {
    expect(
      markMembers(
        [
          { personId: "000000000003", name: "Cara Cedar" },
          { personId: "000000000001", name: "Ada Ash" },
          { name: "Sam" },
        ],
        new Set(["000000000003"])
      ).map((person) => person.member)
    ).toEqual([true, false, false]);
    expect(markMembers([{ personId: "000000000001", name: "Ada Ash" }], "everyone")[0].member).toBe(
      true
    );
  });
  it("are dated by their day, or — for notes from before — when they were started", () => {
    expect(meetingDateOf({ meetingDate: "2026-10-08", createdAt: "2026-10-01T00:00:00Z" })).toBe(
      "2026-10-08"
    );
    expect(
      meetingDateOf({ present: [{ name: "Sam" }], createdAt: "2026-09-30T18:00:00.000Z" })
    ).toBe("2026-09-30");
    expect(meetingDateOf({ createdAt: "2026-09-30T18:00:00.000Z" })).toBeNull();
  });
});

describe("input", () => {
  it("needs a title and a circle; documents are pages or files", () => {
    expect(proposalInputSchema.safeParse({ circleId: "lcc", title: "Mow" }).success).toBe(true);
    expect(proposalInputSchema.safeParse({ circleId: "lcc", title: "" }).success).toBe(false);
    expect(
      proposalInputSchema.safeParse({
        circleId: "lcc",
        title: "Mow",
        documents: [{ kind: "photo", id: PAGE }],
      }).success
    ).toBe(false);
  });
  it("consent names a meeting: notes, minutes, or a day for new notes", () => {
    expect(consentInputSchema.safeParse({ meeting: { kind: "page", id: PAGE } }).success).toBe(
      true
    );
    expect(
      consentInputSchema.safeParse({ meeting: { kind: "new", date: "2026-10-08" } }).success
    ).toBe(true);
    expect(consentInputSchema.safeParse({}).success).toBe(false);
    expect(consentInputSchema.safeParse({ meeting: { kind: "new" } }).success).toBe(false);
  });
  it("orders the soonest to decide first", () => {
    const later = { decideOn: "2026-11-01", createdAt: "2026-10-01" };
    const sooner = { decideOn: "2026-10-10", createdAt: "2026-09-01" };
    const undated = { decideOn: null, createdAt: "2026-10-05" };
    expect([undated, later, sooner].sort(byDecision)).toEqual([sooner, later, undated]);
  });
});
