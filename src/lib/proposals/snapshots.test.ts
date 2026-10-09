import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WikiPage } from "@/lib/wiki/store";
import type { DocumentRecord } from "@/lib/documents/types";
import type { DirectoryDocument } from "@/lib/directory/types";

/**
 * Proposals' snapshots: what's copied when a document is attached (a page's
 * text, a file, a link's text), how the store keeps them as a proposal
 * changes, and what's shown of them — with storage in memory.
 */

const docs = new Map<string, unknown>();
const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => docs.get(key) ?? null,
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(docs.get(key) ?? null);
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
  deleteJson: async (key: string) => void docs.delete(key),
  deleteBinary: async (key: string) => void files.delete(key),
  writeBinary: async (key: string, file: { bytes: Uint8Array; contentType: string }) =>
    void files.set(key, file),
  copyBinary: async (from: string, to: string) => {
    const file = files.get(from);
    if (file) files.set(to, file);
    return !!file;
  },
  enqueue: (_key: string, task: () => unknown) => task(),
}));
const google = vi.hoisted(() => ({ text: null as string | null }));
vi.mock("@/lib/documents/link-fetch", () => ({
  readGoogleText: async () =>
    google.text === null ? null : { shared: true, title: null, text: google.text },
}));

const { takeSnapshots, discardSnapshots, readSnapshotContent, snapshotFileKey } = await import(
  "./snapshots"
);
const store = await import("./store");
const { pageMirror } = await import("./mirror");
const { canSeeSnapshot, changedSinceSnapshot, consentedVersions, documentShown, viewOf } =
  await import("./http");

const cara = { userId: "u-cara", personId: "000000000003", name: "Cara Cedar" };
const PAGE = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";
const LINK = "33333333-3333-4333-8333-333333333333";
const author = { userId: "u-cara", name: "Cara Cedar" };

const page = (overrides: Partial<WikiPage> = {}): WikiPage => ({
  id: PAGE,
  slug: "mowing",
  title: "Mowing",
  body: "Mow the east field monthly.",
  createdAt: "2026-10-01T12:00:00.000Z",
  createdBy: author,
  updatedAt: "2026-10-02T12:00:00.000Z",
  updatedBy: author,
  keeper: "lcc",
  view: { kind: "everyone" },
  edit: { kind: "keeper" },
  historyCount: 0,
  ...overrides,
});
const version = (number: number, extra: object = {}) => ({
  number,
  fileName: "plan.pdf",
  size: 3,
  contentType: "application/pdf",
  viewable: true,
  textChars: 0,
  uploadedBy: cara,
  uploadedAt: "2026-10-01T12:00:00.000Z",
  ...extra,
});
const file = (versions = [version(1), version(2)]): DocumentRecord => ({
  id: FILE,
  circleId: "lcc",
  title: "Mowing plan",
  description: null,
  type: "policy",
  meetingDate: null,
  versions,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
});
const link: DocumentRecord = {
  ...file(),
  id: LINK,
  title: "Mowing rota",
  versions: [
    version(1, {
      fileName: "Mowing rota",
      contentType: "text/uri-list",
      size: 0,
      link: { url: "https://docs.google.com/document/d/abcdefghijklmnop/edit", kind: "google-doc" },
    }),
  ],
};

const directory = {
  people: [],
  households: [],
  circles: [
    { id: "lcc", name: "Land Care Circle", seats: [{ personId: "000000000003" }] },
    { id: "board", name: "Board", seats: [] },
  ],
} as unknown as DirectoryDocument;
const session = (personId: string | null) =>
  ({
    user: { id: `u-${personId}`, personId },
    actor: { ...cara, admin: false },
    directory,
  }) as never;

async function proposed(documents: { kind: "page" | "file"; id: string }[]) {
  const created = await store.createProposal(cara, {
    circleId: "lcc",
    title: "Adopt the mowing plan",
    body: "",
    documents,
    decideOn: null,
  });
  if (!created.ok) throw new Error("not created");
  return created.proposal;
}

beforeEach(() => {
  docs.clear();
  files.clear();
  google.text = null;
  files.set(`documents/files/${FILE}/v2`, {
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "application/pdf",
  });
});

describe("taking snapshots", () => {
  it("copies a page's title and text, with who had last saved it", async () => {
    const [snapshot] = await takeSnapshots([{ kind: "page", id: PAGE }], cara, {
      pages: [page()],
      documents: [],
    });
    expect(snapshot).toMatchObject({
      kind: "page",
      id: PAGE,
      version: "2026-10-02T12:00:00.000Z",
      title: "Mowing",
      takenBy: cara,
      page: { keeper: "lcc", view: { kind: "everyone" } },
    });
    expect(await readSnapshotContent(snapshot.snapshotId)).toEqual({
      title: "Mowing",
      body: "Mow the east field monthly.",
      edited: { by: "Cara Cedar", at: "2026-10-02T12:00:00.000Z" },
    });
  });

  it("copies a file's current version, and a link's text (from Google, or else as read)", async () => {
    google.text = "Week 1: Ada. Week 2: Ben.";
    const [fromFile, fromLink] = await takeSnapshots(
      [
        { kind: "file", id: FILE },
        { kind: "file", id: LINK },
      ],
      cara,
      { pages: [], documents: [file(), link] }
    );
    expect(fromFile).toMatchObject({
      version: "2",
      title: "Mowing plan",
      file: { fileName: "plan.pdf", contentType: "application/pdf", viewable: true },
    });
    expect(files.get(snapshotFileKey(fromFile.snapshotId))?.bytes).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(fromLink.file?.link?.kind).toBe("google-doc");
    expect((await readSnapshotContent(fromLink.snapshotId))?.text).toBe(
      "Week 1: Ada. Week 2: Ben."
    );

    google.text = null;
    docs.set("documents/index.json", { documents: [], textUpdatedAt: "t1" });
    docs.set("documents/text.json", { text: { [LINK]: "Week 1: Cara." } });
    const [asRead] = await takeSnapshots([{ kind: "file", id: LINK }], cara, {
      pages: [],
      documents: [link],
    });
    expect((await readSnapshotContent(asRead.snapshotId))?.text).toBe("Week 1: Cara.");
  });

  it("leaves out documents that are gone, or whose file is missing", async () => {
    const taken = await takeSnapshots(
      [
        { kind: "page", id: PAGE },
        { kind: "file", id: FILE },
      ],
      cara,
      { pages: [], documents: [file([version(1)])] }
    );
    expect(taken).toEqual([]);
  });

  it("throws away the copies of snapshots no longer held", async () => {
    const taken = await takeSnapshots(
      [
        { kind: "page", id: PAGE },
        { kind: "file", id: FILE },
      ],
      cara,
      { pages: [page()], documents: [file()] }
    );
    await discardSnapshots(taken);
    expect(await readSnapshotContent(taken[0].snapshotId)).toBeNull();
    expect(files.has(snapshotFileKey(taken[1].snapshotId))).toBe(false);
  });
});

describe("a proposal's snapshots", () => {
  it("are added for its documents that have none, and never twice", async () => {
    const proposal = await proposed([
      { kind: "page", id: PAGE },
      { kind: "file", id: FILE },
    ]);
    expect(proposal.snapshots).toEqual([]);
    const [first] = await takeSnapshots([{ kind: "page", id: PAGE }], cara, {
      pages: [page()],
      documents: [],
    });
    const added = await store.addSnapshots(proposal.id, [first]);
    expect(added.ok && added.proposal.snapshots).toEqual([first]);
    const [again] = await takeSnapshots([{ kind: "page", id: PAGE }], cara, {
      pages: [page()],
      documents: [],
    });
    const twice = await store.addSnapshots(proposal.id, [again]);
    expect(twice.ok && twice.proposal.snapshots).toEqual([first]);
  });

  it("go when their document is taken off, and are replaced on request", async () => {
    const proposal = await proposed([
      { kind: "page", id: PAGE },
      { kind: "file", id: FILE },
    ]);
    const taken = await takeSnapshots(proposal.documents, cara, {
      pages: [page()],
      documents: [file()],
    });
    await store.addSnapshots(proposal.id, taken);
    const [newer] = await takeSnapshots([{ kind: "page", id: PAGE }], cara, {
      pages: [page({ updatedAt: "2026-10-05T12:00:00.000Z" })],
      documents: [],
    });
    const replaced = await store.replaceSnapshots(proposal.id, cara, [newer]);
    expect(replaced.ok && replaced.replaced).toEqual([taken[0]]);
    expect(replaced.ok && replaced.proposal.snapshots?.map((s) => s.version)).toEqual([
      "2",
      "2026-10-05T12:00:00.000Z",
    ]);
    const updated = await store.updateProposal(proposal.id, cara, {
      documents: [{ kind: "file", id: FILE }],
    });
    expect(updated.ok && updated.proposal.snapshots).toEqual([taken[1]]);
    expect(await store.replaceSnapshots(proposal.id, cara, [newer])).toEqual({
      ok: false,
      reason: "not_attached",
    });
  });

  it("stay as they were once it's consented", async () => {
    const proposal = await proposed([{ kind: "page", id: PAGE }]);
    const [snapshot] = await takeSnapshots(proposal.documents, cara, {
      pages: [page()],
      documents: [],
    });
    await store.addSnapshots(proposal.id, [snapshot]);
    await store.consentToProposal(proposal.id, {
      meeting: {
        kind: "page",
        id: "55555555-5555-4555-8555-555555555555",
        title: "Land Care meeting",
        date: "2026-10-08",
        circleId: "lcc",
        href: "/wiki/land-care-meeting",
      },
      present: [],
      note: null,
      submittedBy: cara,
      documents: [{ kind: "page", id: PAGE, version: snapshot.version }],
    });
    expect(await store.replaceSnapshots(proposal.id, cara, [snapshot])).toEqual({
      ok: false,
      reason: "consented",
    });
    expect(await store.addSnapshots(proposal.id, [snapshot])).toEqual({
      ok: false,
      reason: "consented",
    });
  });
});

describe("what's shown of a snapshot", () => {
  it("says when its document has changed since, and consent goes to the snapshot's version", async () => {
    const proposal = await proposed([
      { kind: "page", id: PAGE },
      { kind: "file", id: FILE },
    ]);
    const taken = await takeSnapshots(proposal.documents, cara, {
      pages: [page()],
      documents: [file()],
    });
    const added = await store.addSnapshots(proposal.id, taken);
    if (!added.ok) throw new Error("not added");
    const edited = page({ updatedAt: "2026-10-06T12:00:00.000Z" });
    const ref = { kind: "page" as const, id: PAGE };
    expect(changedSinceSnapshot(added.proposal, ref, [page()], [file()])).toBe(false);
    expect(changedSinceSnapshot(added.proposal, ref, [edited], [file()])).toBe(true);
    expect(
      changedSinceSnapshot(
        added.proposal,
        { kind: "file", id: FILE },
        [edited],
        [file([version(1), version(2), version(3)])]
      )
    ).toBe(true);
    expect(
      consentedVersions(added.proposal, [edited], [file([version(1), version(2), version(3)])])
    ).toEqual([
      { kind: "page", id: PAGE, version: "2026-10-02T12:00:00.000Z" },
      { kind: "file", id: FILE, version: "2" },
    ]);
    expect(pageMirror(edited, [added.proposal]).proposal?.version).toBe("2026-10-02T12:00:00.000Z");
    const shown = documentShown(added.proposal, ref, session(null), [edited], [file()]);
    expect(shown).toMatchObject({
      title: "Mowing",
      changed: true,
      snapshot: { href: `/proposals/${proposal.id}/snapshots/${taken[0].snapshotId}` },
    });
    const shownFile = documentShown(
      added.proposal,
      { kind: "file", id: FILE },
      session(null),
      [],
      [file()]
    );
    expect(shownFile.snapshot?.href).toBe(
      `/api/proposals/${proposal.id}/snapshots/${taken[1].snapshotId}/file`
    );
  });

  it("is seen only by those who can see the page — or could, once it's gone", async () => {
    const proposal = await proposed([{ kind: "page", id: PAGE }]);
    const keeperOnly = page({ view: { kind: "keeper" } });
    const [snapshot] = await takeSnapshots(proposal.documents, cara, {
      pages: [keeperOnly],
      documents: [],
    });
    const added = await store.addSnapshots(proposal.id, [snapshot]);
    if (!added.ok) throw new Error("not added");
    const member = session("000000000003");
    const other = session("000000000009");
    expect(canSeeSnapshot(snapshot, member, [keeperOnly])).toBe(true);
    expect(canSeeSnapshot(snapshot, other, [keeperOnly])).toBe(false);
    // Gone: as it could be seen then.
    expect(canSeeSnapshot(snapshot, member, [])).toBe(true);
    expect(canSeeSnapshot(snapshot, other, [])).toBe(false);
    const ref = { kind: "page" as const, id: PAGE };
    expect(documentShown(added.proposal, ref, other, [keeperOnly], [])).toMatchObject({
      title: "A page that's gone or private",
      snapshot: null,
    });
    expect(documentShown(added.proposal, ref, member, [], [])).toMatchObject({
      title: "Mowing",
      missing: true,
      snapshot: { snapshotId: snapshot.snapshotId },
    });
    // Nor are its details (its title) in the proposal as they see it.
    expect(viewOf(added.proposal, other, [keeperOnly], []).snapshots).toEqual([]);
    expect(viewOf(added.proposal, member, [keeperOnly], []).snapshots).toEqual([snapshot]);
  });
});
