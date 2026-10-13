/**
 * Reading a backup's zip by its index (pure, for tests and the restore). A
 * zip ends with a central directory: each file's name, how it's stored, its
 * sizes and where it starts. A restore reads that first (two small ranged
 * reads), then cuts each file out of the zip at exactly those places — never
 * by looking for markers in the data, which a stored file (a photo, an
 * .xlsx that is itself a zip) can contain. Backups are under 4 GB and 65,535
 * files (the zips are written without the Zip64 extensions), so anything
 * bigger is refused rather than misread.
 */

export interface ZipEntry {
  name: string;
  /** 0: stored as is; 8: deflated. */
  method: number;
  compressedSize: number;
  size: number;
  /** Where its local header starts. */
  offset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX16 = 0xffff;
const MAX32 = 0xffffffff;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const decoder = new TextDecoder();

/** How far from the end to look for the end of the central directory (its record, and a comment). */
export const TAIL_BYTES = 22 + MAX16;

/**
 * Where the central directory is, from the zip's last bytes (`tail`, which
 * ends at the zip's end): its offset, size and number of entries.
 */
export function findCentralDirectory(tail: Uint8Array) {
  const data = view(tail);
  for (let at = tail.length - 22; at >= 0; at--) {
    if (data.getUint32(at, true) !== EOCD) continue;
    const entries = data.getUint16(at + 10, true);
    const size = data.getUint32(at + 12, true);
    const offset = data.getUint32(at + 16, true);
    if (entries === MAX16 || size === MAX32 || offset === MAX32)
      throw new Error("The backup is too big to restore here (it needs Zip64)");
    return { entries, size, offset };
  }
  throw new Error("That isn't a zip: its end can't be found");
}

/** Every entry in the central directory. */
export function parseCentralDirectory(bytes: Uint8Array, expected: number): ZipEntry[] {
  const data = view(bytes);
  const entries: ZipEntry[] = [];
  let at = 0;
  while (at + 46 <= bytes.length && data.getUint32(at, true) === CENTRAL) {
    const nameLength = data.getUint16(at + 28, true);
    const extraLength = data.getUint16(at + 30, true);
    const commentLength = data.getUint16(at + 32, true);
    const entry: ZipEntry = {
      method: data.getUint16(at + 10, true),
      compressedSize: data.getUint32(at + 20, true),
      size: data.getUint32(at + 24, true),
      offset: data.getUint32(at + 42, true),
      name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)),
    };
    if (entry.compressedSize === MAX32 || entry.size === MAX32 || entry.offset === MAX32)
      throw new Error("The backup is too big to restore here (it needs Zip64)");
    entries.push(entry);
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (entries.length !== expected)
    throw new Error(`The zip's index lists ${entries.length} of its ${expected} files`);
  return entries;
}

/** From a local header's first 30 bytes: how far past it the file's data starts. */
export function localDataStart(header: Uint8Array) {
  const data = view(header);
  if (data.getUint32(0, true) !== LOCAL) throw new Error("The zip's index doesn't match its files");
  return 30 + data.getUint16(26, true) + data.getUint16(28, true);
}

/** An entry's path inside the backup, without its top folder (`cvc-backup-<date>/`). */
export const insidePath = (name: string) => name.slice(name.indexOf("/") + 1);

type Fingerprinted = { bytes: number; sha256: string };

/**
 * What a restore got wrong, compared with the backup's manifest: files it
 * lists under `data/` that weren't restored, restored differently, or
 * restored without being listed.
 */
export function compareRestore(
  manifest: { path: string; bytes: number; sha256: string }[],
  restored: ReadonlyMap<string, Fingerprinted>
) {
  const listed = new Map(
    manifest
      .filter((file) => file.path.startsWith("data/"))
      .map((file) => [file.path.slice("data/".length), file] as const)
  );
  const missing: string[] = [];
  const changed: string[] = [];
  for (const [key, file] of Array.from(listed)) {
    const got = restored.get(key);
    if (!got) missing.push(key);
    else if (got.sha256 !== file.sha256 || got.bytes !== file.bytes) changed.push(key);
  }
  const extra = Array.from(restored.keys()).filter((key) => !listed.has(key));
  return { listed: listed.size, missing, changed, extra };
}

/** Whether a restore target is CVC's own bucket (its account's R2 address, and the same bucket). */
export function isOwnBucket(
  target: { endpoint: string; bucket: string },
  own: { accountId: string; bucket: string } | null
) {
  if (!own) return false;
  let host = "";
  try {
    host = new URL(target.endpoint).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host.split(".").includes(own.accountId.toLowerCase()) &&
    target.bucket.trim().toLowerCase() === own.bucket.toLowerCase()
  );
}
