import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Perspective } from "@/lib/wiki/perspectives-shared";

/**
 * Alternative versions put to a meeting with a proposal: the copy taken as
 * one's put forward, how the store keeps them with their pages, the
 * meeting's choice, and copying one again — with storage in memory.
 */

const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => structuredClone(docs.get(key) ?? null),
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(structuredClone(docs.get(key) ?? null));
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
  deleteJson: async (key: string) => void docs.delete(key),
  deleteBinary: async () => undefined,
  copyBinary: async () => false,
}));

const { takeVersionSnapshot, discardVersionSnapshots, readSnapshotContent } = await import(
  "./snapshots"
);
const store = await import("./store");
const { checkChosen, chosenFor, versionsFor } = await import("./shared");

const cara = { userId: "u-cara", personId: "000000000003", name: "Cara Cedar" };
const PAGE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EVES = "33333333-3333-4333-8333-333333333333";
const DEVS = "44444444-4444-4444-8444-444444444444";

const page = {
  id: PAGE,
  title: "Mowing",
  body: "# Mowing\n\nMow monthly.\n\nThanks.\n",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const perspective = (id: string, name: string, body: string): Perspective => ({
  id,
  pageId: PAGE,
  name,
  body,
  base: { updatedAt: page.updatedAt, body: page.body },
  createdBy: { userId: `u-${name}`, personId: null, name: `${name} Person` },
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedBy: { userId: `u-${name}`, personId: null, name: `${name} Person` },
  updatedAt: "2026-10-02T00:00:00.000Z",
  status: "open",
});

beforeEach(() => docs.clear());

describe("a version put forward", () => {
  it("is copied with the page's changes since brought in, against the page now", async () => {
    const eves = perspective(EVES, "Eve", "# Mowing\n\nMow twice a month.\n\nThanks.\n");
    const now = {
      ...page,
      body: "# Mowing\n\nMow monthly.\n\nThanks.\n\nAsk Ben first.\n",
      updatedAt: "2026-10-05T00:00:00.000Z",
    };
    const copy = await takeVersionSnapshot(eves, now, cara);
    expect(copy).toMatchObject({
      pageId: PAGE,
      perspectiveId: EVES,
      name: "Eve",
      author: { name: "Eve Person" },
      version: eves.updatedAt,
      takenBy: { name: "Cara Cedar" },
    });
    expect(await readSnapshotContent(copy.snapshotId)).toMatchObject({
      title: "Mowing",
      body: "# Mowing\n\nMow twice a month.\n\nThanks.\n\nAsk Ben first.\n",
      base: { body: now.body, updatedAt: now.updatedAt },
    });
    await discardVersionSnapshots([copy]);
    expect(await readSnapshotContent(copy.snapshotId)).toBeNull();
  });
});

describe("proposals with versions", () => {
  async function proposed() {
    const eves = await takeVersionSnapshot(perspective(EVES, "Eve", "Mow twice."), page, cara);
    const devs = await takeVersionSnapshot(perspective(DEVS, "Dev", "Mow never."), page, cara);
    const created = await store.createProposal(cara, {
      circleId: "lcc",
      title: "Adopt a mowing plan",
      body: "",
      documents: [{ kind: "page", id: OTHER }],
      decideOn: null,
      versions: [eves, devs],
    });
    if (!created.ok) throw new Error(created.reason);
    return { proposal: created.proposal, eves, devs };
  }

  it("take their page among the documents", async () => {
    const { proposal } = await proposed();
    expect(proposal.documents).toEqual([
      { kind: "page", id: OTHER },
      { kind: "page", id: PAGE },
    ]);
    expect(versionsFor(proposal, PAGE).map((version) => version.perspectiveId)).toEqual([
      EVES,
      DEVS,
    ]);
  });

  it("go when their page is taken off, and come with it when given", async () => {
    const { proposal, eves } = await proposed();
    const off = await store.updateProposal(proposal.id, cara, {
      documents: [{ kind: "page", id: OTHER }],
    });
    expect(off.ok && off.proposal.versions).toEqual([]);
    const back = await store.updateProposal(proposal.id, cara, { versions: [eves] });
    expect(back.ok && back.proposal.documents).toEqual([
      { kind: "page", id: OTHER },
      { kind: "page", id: PAGE },
    ]);
    expect(back.ok && back.proposal.versions?.map((version) => version.perspectiveId)).toEqual([
      EVES,
    ]);
    // A change that doesn't touch the documents keeps them.
    const renamed = await store.updateProposal(proposal.id, cara, { title: "Mowing plan" });
    expect(renamed.ok && renamed.proposal.versions).toHaveLength(1);
  });

  it("are copied again in place, only while waiting for consent", async () => {
    const { proposal, eves } = await proposed();
    const again = await takeVersionSnapshot(perspective(EVES, "Eve", "Mow weekly."), page, cara);
    const result = await store.replaceVersions(proposal.id, cara, [again]);
    expect(result.ok && result.replaced.map((version) => version.snapshotId)).toEqual([
      eves.snapshotId,
    ]);
    expect(result.ok && result.proposal.versions?.map((version) => version.snapshotId)).toEqual([
      again.snapshotId,
      proposal.versions![1].snapshotId,
    ]);
    const stranger = { ...again, perspectiveId: "55555555-5555-4555-8555-555555555555" };
    expect(await store.replaceVersions(proposal.id, cara, [stranger])).toEqual({
      ok: false,
      reason: "not_attached",
    });
  });

  it("record which the meeting chose", async () => {
    const { proposal } = await proposed();
    const result = await store.consentToProposal(proposal.id, {
      meeting: {
        kind: "page",
        id: "66666666-6666-4666-8666-666666666666",
        title: "Land Care meeting, Oct 8",
        date: "2026-10-08",
        circleId: "lcc",
        href: "/wiki/land-care-meeting-oct-8",
      },
      present: [],
      note: null,
      submittedBy: cara,
      documents: [{ kind: "page", id: PAGE, version: "2026-10-08T20:00:00.000Z" }],
      chosen: [{ pageId: PAGE, perspectiveId: EVES }],
    });
    if (!result.ok) throw new Error(result.reason);
    expect(chosenFor(result.proposal, PAGE)).toBe(EVES);
    expect(chosenFor(result.proposal, OTHER)).toBeUndefined();
    expect(await store.replaceVersions(proposal.id, cara, [])).toEqual({
      ok: false,
      reason: "consented",
    });
  });
});

describe("checkChosen", () => {
  const versions = [
    { pageId: PAGE, perspectiveId: EVES },
    { pageId: PAGE, perspectiveId: DEVS },
  ];
  it("needs one choice for each page with versions: one of them, or the page as proposed", () => {
    expect(checkChosen(versions, [{ pageId: PAGE, perspectiveId: DEVS }])).toBeNull();
    expect(checkChosen(versions, [{ pageId: PAGE, perspectiveId: null }])).toBeNull();
    expect(checkChosen(versions, [])).toMatch(/Say which version/);
    expect(
      checkChosen(versions, [
        { pageId: PAGE, perspectiveId: EVES },
        { pageId: PAGE, perspectiveId: DEVS },
      ])
    ).toMatch(/Say which version/);
  });
  it("refuses a version that wasn't put forward, or a page that had none", () => {
    expect(
      checkChosen(versions, [
        { pageId: PAGE, perspectiveId: "55555555-5555-4555-8555-555555555555" },
      ])
    ).toMatch(/wasn't put forward/);
    expect(
      checkChosen(versions, [
        { pageId: PAGE, perspectiveId: EVES },
        { pageId: OTHER, perspectiveId: null },
      ])
    ).toMatch(/No versions of that page/);
    expect(checkChosen([], undefined)).toBeNull();
  });
});
