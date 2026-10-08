import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CircleModule } from "@/lib/circles/layout";

// Who's asking, and the directory they see: set by each test.
let asking: { personId: string; admin: boolean };
let modules: CircleModule[] | undefined;
vi.mock("@/lib/circles/access", () => ({
  circleContext: async () => {
    const seat = (personId: string) => ({ personId, name: null, position: null, termEnds: null });
    return {
      user: { id: "u", personId: asking.personId, name: "Someone" },
      actor: { userId: "u", personId: asking.personId, name: "Someone", admin: asking.admin },
      personId: asking.personId,
      directory: {
        people: [],
        circles: [
          { id: "board", name: "Board", seats: [seat("000000000001")] },
          { id: "lcc", name: "Land Care Circle", seats: [seat("000000000003")], modules },
        ],
      },
      imported: [],
    };
  },
}));

const http = await import("./http");
const { MAX_RECEIPT_BYTES, RECEIPT_PART_BYTES } = await import("./shared");

const finances = (view?: "everyone" | "members"): CircleModule[] => [
  { id: "finances", type: "finances", size: "full", ...(view ? { finances: { view } } : {}) },
];
async function contextFor(
  personId: string,
  options: { edit?: boolean; admin?: boolean; expenseId?: string } = {}
) {
  asking = { personId, admin: !!options.admin };
  const ctx = await http.financesContext("lcc", options);
  if (ctx.error) return { status: ctx.error.status, detail: (await ctx.error.json()).detail };
  return { canEdit: ctx.canEdit, view: ctx.view };
}
const CARA = "000000000003"; // in Land Care
const ADA = "000000000001"; // on the Board
const EVE = "000000000005"; // in neither

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T16:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("financesContext", () => {
  it("is a 404 without a Finances module on the circle's page", async () => {
    modules = [{ id: "log", type: "log", size: "full" }];
    expect(await contextFor(CARA)).toEqual({
      status: 404,
      detail: "Land Care Circle has no Finances module",
    });
  });

  it("lets everyone see them by default, and only members, the Board and admins change them", async () => {
    modules = finances();
    expect(await contextFor(EVE)).toEqual({ canEdit: false, view: "everyone" });
    expect(await contextFor(CARA)).toEqual({ canEdit: true, view: "everyone" });
    expect(await contextFor(ADA)).toEqual({ canEdit: true, view: "everyone" });
    expect(await contextFor(EVE, { edit: true })).toMatchObject({ status: 403 });
    expect(await contextFor(CARA, { edit: true })).toEqual({ canEdit: true, view: "everyone" });
  });

  it("keeps them from everyone else when the module says members", async () => {
    modules = finances("members");
    expect(await contextFor(EVE)).toEqual({
      status: 403,
      detail: "Only Land Care Circle's members and the Board can see its finances.",
    });
    expect(await contextFor(ADA)).toEqual({ canEdit: true, view: "members" });
    expect(await contextFor(EVE, { admin: true })).toEqual({ canEdit: true, view: "members" });
  });

  it("refuses an expense id that couldn't be one", async () => {
    modules = finances();
    expect(await contextFor(CARA, { expenseId: "../../x" })).toMatchObject({ status: 404 });
  });
});

describe("yearAsked", () => {
  const year = (query: string) => http.yearAsked(new URLSearchParams(query));
  it("is this year (in Vermont) unless another is asked for", () => {
    expect(year("")).toBe("2026");
    expect(year("year=2024")).toBe("2024");
    expect(year("year=2027")).toBe("2027");
  });
  it("is null for a year that can't hold anything", () => {
    expect(year("year=2028")).toBeNull();
    expect(year("year=1999")).toBeNull();
    expect(year("year=abcd")).toBeNull();
  });
});

describe("receipts", () => {
  const bytes = (...head: number[]) => new Uint8Array([...head, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const pdf = new TextEncoder().encode("%PDF-1.7\n%…");

  it("are photos or PDFs, judged by their bytes", () => {
    expect(http.sniffReceiptType(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(http.sniffReceiptType(bytes(0x89, 0x50, 0x4e, 0x47))).toBe("image/png");
    expect(http.sniffReceiptType(pdf)).toBe("application/pdf");
    expect(http.sniffReceiptType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect("error" in http.checkReceipt(new TextEncoder().encode("<svg onload=x>"))).toBe(true);
    expect(http.checkReceipt(pdf)).toEqual({ contentType: "application/pdf" });
  });

  it("are named without folders, with the ending their type has", () => {
    expect(http.receiptName("Home Depot.pdf", "application/pdf")).toBe("Home Depot.pdf");
    expect(http.receiptName("IMG_0042.HEIC", "image/jpeg")).toBe("IMG_0042.jpg");
    expect(http.receiptName("../../etc/passwd", "image/png")).toBe("passwd.png");
    expect(http.receiptName(null, "application/pdf")).toBe("receipt.pdf");
    expect(http.receiptName('a"b\u0000.pdf', "application/pdf")).toBe("ab.pdf");
  });

  const put = (size: number, query: string) =>
    http.readReceiptPart(
      new Request("http://x/receipt", { method: "PUT", body: new Uint8Array(size) }),
      new URLSearchParams(query)
    );
  const upload = "0b6f2a52-6a43-4b0e-9a8f-0d3c2d1e5f60";

  it("come whole up to 10 MB, or in pieces of exactly 4 MB but the last", async () => {
    expect(await put(1000, "")).toMatchObject({ part: 0, parts: 1, uploadId: null });
    expect(await put(RECEIPT_PART_BYTES, `upload=${upload}&part=0&parts=3`)).toMatchObject({
      part: 0,
      parts: 3,
      uploadId: upload,
    });
    expect(await put(10, `upload=${upload}&part=2&parts=3`)).toMatchObject({ part: 2 });
    const status = async (size: number, query: string) => {
      const result = await put(size, query);
      return "error" in result ? result.error.status : 200;
    };
    expect(await status(MAX_RECEIPT_BYTES + 1, "")).toBe(413);
    expect(await status(10, `upload=${upload}&part=0&parts=4`)).toBe(413);
    expect(await status(10, `upload=${upload}&part=0&parts=3`)).toBe(400); // too short a piece
    expect(await status(10, `part=0&parts=3`)).toBe(400); // no upload id
    expect(await status(10, `upload=${upload}&part=3&parts=3`)).toBe(400);
    expect(await status(0, "")).toBe(400);
  });
});
