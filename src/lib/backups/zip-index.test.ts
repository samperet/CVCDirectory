import { createHash, randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import { Zip, ZipDeflate, ZipPassThrough, inflateSync, strToU8 } from "fflate";
import {
  TAIL_BYTES,
  compareRestore,
  findCentralDirectory,
  insidePath,
  isOwnBucket,
  localDataStart,
  parseCentralDirectory,
} from "./zip-index";

/** A zip written as backups are: streamed, so sizes come after each file. */
function backupLikeZip(files: [string, Uint8Array, boolean][]) {
  const out: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    out.push(chunk);
  });
  for (const [name, bytes, compress] of files) {
    const file = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
    zip.add(file);
    file.push(bytes, true);
  }
  zip.end();
  const all = new Uint8Array(out.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of out) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return all;
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("reading a backup's zip by its index", () => {
  it("finds every file exactly, even a stored file that is itself a zip", () => {
    // An .xlsx is a zip: its own headers inside a stored file fool anything that looks for markers.
    const inner = backupLikeZip([
      ["sheet.xml", new Uint8Array(randomBytes(4000)), true],
      ["image.bin", new Uint8Array(randomBytes(3000)), false],
    ]);
    const json = strToU8(JSON.stringify({ people: [1, 2, 3] }));
    const zip = backupLikeZip([
      ["cvc-backup-2026-10-13/data/documents/files/x/v1", inner, false],
      ["cvc-backup-2026-10-13/data/directory/directory.json", json, true],
      ["cvc-backup-2026-10-13/manifest.json", strToU8("{}"), true],
    ]);
    const where = findCentralDirectory(zip.subarray(Math.max(0, zip.length - TAIL_BYTES)));
    const entries = parseCentralDirectory(
      zip.subarray(where.offset, where.offset + where.size),
      where.entries
    );
    expect(entries.map((entry) => insidePath(entry.name))).toEqual([
      "data/documents/files/x/v1",
      "data/directory/directory.json",
      "manifest.json",
    ]);
    const read = (index: number) => {
      const entry = entries[index];
      const start = entry.offset + localDataStart(zip.subarray(entry.offset, entry.offset + 30));
      const raw = zip.subarray(start, start + entry.compressedSize);
      return entry.method === 8 ? inflateSync(raw) : raw;
    };
    expect(sha(read(0))).toBe(sha(inner));
    expect(sha(read(1))).toBe(sha(json));
  });

  it("refuses what isn't a zip", () => {
    expect(() => findCentralDirectory(strToU8("not a zip at all, nothing here"))).toThrow(
      /isn't a zip/
    );
  });

  it("says what a restore got wrong", () => {
    const manifest = [
      { path: "data/a.json", bytes: 2, sha256: "aa" },
      { path: "data/b.jpg", bytes: 5, sha256: "bb" },
      { path: "data/c.json", bytes: 1, sha256: "cc" },
      { path: "pages/x.md", bytes: 9, sha256: "dd" },
    ];
    const restored = new Map([
      ["a.json", { bytes: 2, sha256: "aa" }],
      ["b.jpg", { bytes: 5, sha256: "XX" }],
      ["z.json", { bytes: 1, sha256: "zz" }],
    ]);
    expect(compareRestore(manifest, restored)).toEqual({
      listed: 3,
      missing: ["c.json"],
      changed: ["b.jpg"],
      extra: ["z.json"],
    });
    const all = new Map(manifest.slice(0, 3).map((f) => [f.path.slice(5), f]));
    expect(compareRestore(manifest, all)).toMatchObject({ missing: [], changed: [], extra: [] });
  });

  it("knows CVC's own bucket", () => {
    const own = { accountId: "0123abcd", bucket: "cvc-data" };
    const r2 = "https://0123abcd.r2.cloudflarestorage.com";
    expect(isOwnBucket({ endpoint: r2, bucket: "cvc-data" }, own)).toBe(true);
    expect(
      isOwnBucket({ endpoint: `${r2.replace("0123abcd", "0123abcd.eu")}`, bucket: "cvc-data" }, own)
    ).toBe(true);
    expect(isOwnBucket({ endpoint: r2, bucket: "cvc-restore-test" }, own)).toBe(false);
    expect(isOwnBucket({ endpoint: "https://s3.example.org", bucket: "cvc-data" }, own)).toBe(
      false
    );
    expect(isOwnBucket({ endpoint: r2, bucket: "cvc-data" }, null)).toBe(false);
  });
});
