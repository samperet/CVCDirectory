import { beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import type { DirectoryDocument } from "@/lib/directory/types";

/**
 * Exports, made for real into storage held in memory: what's chosen (and
 * seen), how it's named and filed, what goes in the zip, and who may
 * download it.
 */

const MOWING = "11111111-1111-4111-8111-111111111111";
const SECRET = "22222222-2222-4222-8222-222222222222";
const MANUAL = "33333333-3333-4333-8333-333333333333";
const ROTA = "44444444-4444-4444-8444-444444444444";
const LOST = "55555555-5555-4555-8555-555555555555";
const PROPOSAL = "66666666-6666-4666-8666-666666666666";
const PHOTO = "77777777-7777-4777-8777-777777777777";

const data = vi.hoisted(() => ({
  json: new Map<string, unknown>(),
  files: new Map<string, Uint8Array>(),
}));
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => data.json.get(key) ?? null,
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(data.json.get(key) ?? null);
    if ("value" in next) data.json.set(key, next.value);
    return next.result;
  },
  deleteBinary: async (key: string) => void data.files.delete(key),
  readBinaryStream: async (key: string) => {
    const bytes = data.files.get(key);
    if (!bytes) return null;
    // In two pieces, as a stream would bring it.
    return (async function* () {
      yield bytes.subarray(0, 3);
      yield bytes.subarray(3);
    })();
  },
  writeBinaryStream: async (key: string, chunks: AsyncIterable<Uint8Array>) => {
    const parts: Uint8Array[] = [];
    for await (const chunk of chunks) parts.push(chunk);
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.length;
    }
    data.files.set(key, bytes);
    return bytes.length;
  },
}));

const at = "2026-10-01T12:00:00.000Z";
const author = { userId: "u-cara", name: "Cara Cedar" };
const pageOf = (
  id: string,
  slug: string,
  title: string,
  body: string,
  view = { kind: "everyone" }
) => ({
  id,
  slug,
  title,
  body,
  keeper: "lcc",
  view,
  edit: { kind: "keeper" },
  createdAt: at,
  createdBy: author,
  updatedAt: at,
  updatedBy: author,
  historyCount: 0,
});
const version = (extra: object = {}) => ({
  number: 1,
  fileName: "manual.pdf",
  size: 10,
  contentType: "application/pdf",
  viewable: true,
  textChars: 0,
  uploadedBy: { userId: "u-cara", personId: "000000000003", name: "Cara Cedar" },
  uploadedAt: at,
  ...extra,
});
const docOf = (id: string, title: string, versions: object[], circleId = "lcc") => ({
  id,
  circleId,
  title,
  description: null,
  type: "other",
  meetingDate: null,
  versions,
  createdAt: at,
  updatedAt: at,
});

vi.mock("@/lib/wiki/store", () => ({
  readPages: async () => [
    pageOf(
      MOWING,
      "mowing",
      "Mowing",
      `Mow monthly. See [[doc:Stove manual]] and [[Secret plans]].\n\n![The field](/api/circles/lcc/wiki/images/${PHOTO})`
    ),
    pageOf(SECRET, "secret-plans", "Secret plans", "Hush.", { kind: "keeper" }),
  ],
}));
vi.mock("@/lib/documents/store", () => ({
  listDocuments: async () => [
    docOf(MANUAL, "Stove manual", [version()]),
    docOf(ROTA, "Mowing rota", [
      version({
        fileName: "Mowing rota",
        size: 0,
        contentType: "text/uri-list",
        link: { url: "https://docs.google.com/document/d/abcdefghijk/edit", kind: "google-doc" },
      }),
    ]),
    docOf(LOST, "Lost minutes", [version({ number: 1, fileName: "lost.pdf" })], "board"),
  ],
  getDocumentTexts: async () => ({ [ROTA]: "Week 1: Ada." }),
  fileKey: (id: string, number: number) => `documents/files/${id}/v${number}`,
}));
vi.mock("@/lib/proposals/store", () => ({
  listProposals: async () => [
    {
      id: PROPOSAL,
      circleId: "lcc",
      title: "Adopt the mowing plan",
      body: "Mow monthly.",
      documents: [{ kind: "page", id: MOWING }],
      snapshots: [],
      decideOn: null,
      status: "proposed",
      proposedBy: { userId: "u-cara", personId: null, name: "Cara Cedar" },
      createdAt: at,
      updatedBy: { userId: "u-cara", personId: null, name: "Cara Cedar" },
      updatedAt: at,
      consent: null,
      withdrawn: null,
    },
  ],
}));
vi.mock("@/lib/polls/wiki", () => ({ listWikiPolls: async () => [] }));
vi.mock("@/lib/documents/type-store", () => ({
  readTypeMap: async () => ({}),
  typeLabelFor: () => "Policy",
}));
vi.mock("@/lib/wiki/images", () => ({
  imageKey: (circleId: string, id: string) => `wiki-images/${circleId}/${id}`,
  listWikiImages: async (circleId: string) =>
    circleId === "lcc" ? [{ id: PHOTO, contentType: "image/jpeg" }] : [],
}));

const { findExport, planExport, saveExport } = await import("./export");

const directory = {
  people: [],
  households: [],
  circles: [
    { id: "lcc", name: "Land Care Circle", seats: [{ personId: "000000000003" }] },
    { id: "board", name: "Board", seats: [] },
  ],
} as unknown as DirectoryDocument;
const sessionOf = (personId: string, name: string) =>
  ({
    user: { id: `u-${personId}`, personId },
    actor: { userId: `u-${personId}`, personId, name, admin: false },
    directory,
  }) as never;
const cara = sessionOf("000000000003", "Cara Cedar");
const eve = sessionOf("000000000005", "Eve Elm");

/** Make the export and open it: each file's name (under its folder) and contents. */
async function exported(choice: Parameters<typeof planExport>[0], session = cara) {
  const plan = await planExport(choice, session);
  if ("error" in plan) throw new Error(plan.error);
  const record = await saveExport(`u-${session === cara ? "cara" : "eve"}`, plan);
  const zip = unzipSync(data.files.get(`exports/${record.id}.zip`)!);
  const root = `${plan.root}/`;
  const files = Object.fromEntries(
    Object.entries(zip).map(([name, bytes]) => [name.slice(root.length), bytes])
  );
  return { plan, record, files, text: (name: string) => strFromU8(files[name]) };
}

beforeEach(() => {
  data.json.clear();
  data.files.clear();
  data.files.set(`documents/files/${MANUAL}/v1`, new TextEncoder().encode("%PDF-1.4 manual"));
  data.files.set(`wiki-images/lcc/${PHOTO}`, new Uint8Array([0xff, 0xd8, 0xff, 1, 2]));
});

describe("exporting documents", () => {
  it("files everything by circle: pages, proposals and links as Markdown, files as uploaded, photos too", async () => {
    const { plan, files, text } = await exported({ all: true });
    expect(plan.fileName).toMatch(/^CVC documents \d{4}-\d{2}-\d{2}\.zip$/);
    expect(Object.keys(files).sort()).toEqual([
      "Land Care Circle/Mowing rota (link).md",
      "Land Care Circle/Mowing.md",
      "Land Care Circle/Proposals/Adopt the mowing plan.md",
      "Land Care Circle/Secret plans.md",
      "Land Care Circle/Stove manual.pdf",
      "README.md",
      `images/${PHOTO}.jpg`,
    ]);
    expect(text("Land Care Circle/Stove manual.pdf")).toBe("%PDF-1.4 manual");
    expect(Array.from(files[`images/${PHOTO}.jpg`])).toEqual([0xff, 0xd8, 0xff, 1, 2]);
    const mowing = text("Land Care Circle/Mowing.md");
    expect(mowing).toContain("# Mowing");
    expect(mowing).toContain(
      "[Stove manual](Stove%20manual.pdf) and [Secret plans](Secret%20plans.md)"
    );
    expect(mowing).toContain(`![The field](../images/${PHOTO}.jpg)`);
    expect(text("Land Care Circle/Mowing rota (link).md")).toContain("Week 1: Ada.");
    expect(text("Land Care Circle/Proposals/Adopt the mowing plan.md")).toContain(
      "- [Mowing](../Mowing.md)"
    );
    const readme = text("README.md");
    expect(readme).toContain("by Cara Cedar: 5 documents.");
    expect(readme).toContain("## Land Care Circle");
    // The Board's minutes have lost their file: said so, not zipped empty.
    expect(readme).toContain("Lost minutes (Board): its file couldn't be found");
    expect(plan.counts).toEqual({ pages: 2, files: 2, links: 1, proposals: 1 });
  });

  it("keeps to what's chosen, and to what the reader can see", async () => {
    const chosen = await exported({
      items: [
        { kind: "page", id: MOWING },
        { kind: "file", id: MANUAL },
      ],
    });
    expect(Object.keys(chosen.files).sort()).toEqual([
      "Land Care Circle/Mowing.md",
      "Land Care Circle/Stove manual.pdf",
      "README.md",
      `images/${PHOTO}.jpg`,
    ]);
    // Not in the export: links into the app instead.
    expect(chosen.text("Land Care Circle/Mowing.md")).toContain(
      "(https://cvc-directory.vercel.app/wiki/secret-plans)"
    );

    const seen = await exported(
      {
        items: [
          { kind: "page", id: SECRET },
          { kind: "page", id: MOWING },
        ],
      },
      eve
    );
    expect(Object.keys(seen.files)).not.toContain("Land Care Circle/Secret plans.md");
    expect(seen.text("Land Care Circle/Mowing.md")).toContain("and Secret plans.");
    expect(seen.text("README.md")).toContain("1 document that is gone, or that you can't see");
    expect(await planExport({ items: [{ kind: "page", id: SECRET }] }, eve)).toEqual({
      error: "empty",
    });
  });

  it("is a circle's alone when asked, and downloaded only by whoever made it, for a day", async () => {
    const board = await exported({ all: true, circle: "board" });
    expect(board.plan.fileName).toMatch(/^Board documents /);
    expect(Object.keys(board.files)).toEqual(["README.md"]);
    expect(await findExport(board.record.id, "u-cara")).toMatchObject({
      fileName: board.plan.fileName,
      key: `exports/${board.record.id}.zip`,
    });
    expect(await findExport(board.record.id, "u-eve")).toBeNull();
    // A day on, it's gone — and its zip deleted when the next export is made.
    const index = data.json.get("exports/index.json") as { exports: { createdAt: string }[] };
    index.exports[0].createdAt = "2026-01-01T00:00:00.000Z";
    expect(await findExport(board.record.id, "u-cara")).toBeNull();
    await exported({ items: [{ kind: "page", id: MOWING }] });
    expect(data.files.has(`exports/${board.record.id}.zip`)).toBe(false);
  });
});
