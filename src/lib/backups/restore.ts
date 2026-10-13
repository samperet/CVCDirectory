import { createHash } from "crypto";
import { inflateSync } from "fflate";
import { readBinaryRange, readBinaryStream, readJson } from "@/lib/storage";
import { describe, s3Client } from "./deliver";
import { zipKey } from "./store";
import {
  TAIL_BYTES,
  compareRestore,
  findCentralDirectory,
  insidePath,
  localDataStart,
  parseCentralDirectory,
  type ZipEntry,
} from "./zip-index";
import type { BackupRecord, RestoreCheck, RestoreReport } from "./shared";

/**
 * Restoring a backup into a new, empty bucket (any S3-compatible storage; R2
 * for the test) — to prove a backup can bring CVC back. It refuses a bucket
 * that has anything in it, so nothing is ever overwritten (the route also
 * refuses CVC's own). It reads the zip's index and manifest first, then
 * streams the zip once, cutting out each file under `data/` at its place
 * (`zip-index.ts`) and writing it at its storage key with the type it had.
 * Then it checks: the zip's fingerprint, every file's against the manifest,
 * the bucket's listing, the types, and that the app's main documents read
 * back. The key is used for this and never kept.
 */

export interface RestoreTarget {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

type ManifestFile = { path: string; bytes: number; sha256: string; contentType?: string };

/** At most this many files are written at once, and this many bytes held for them. */
const PARALLEL = 8;
const MAX_HELD = 256 * 1024 * 1024;

/** Reads the zip from start to end, once, taking or skipping bytes as asked — and fingerprinting it all. */
function sequential(chunks: AsyncIterable<Uint8Array>, hash: ReturnType<typeof createHash>) {
  const iterator = chunks[Symbol.asyncIterator]();
  let pending: Uint8Array[] = [];
  let held = 0;
  let position = 0;
  let ended = false;
  const pull = async () => {
    const next = await iterator.next();
    if (next.done) {
      ended = true;
      return;
    }
    const chunk = new Uint8Array(next.value);
    hash.update(chunk);
    pending.push(chunk);
    held += chunk.length;
  };
  const advance = (count: number, into?: Uint8Array) => {
    let done = 0;
    while (done < count) {
      const head = pending[0];
      const want = count - done;
      const piece = head.length <= want ? head : head.subarray(0, want);
      into?.set(piece, done);
      done += piece.length;
      if (piece === head) pending.shift();
      else pending[0] = head.subarray(want);
    }
    held -= count;
    position += count;
  };
  return {
    get position() {
      return position;
    },
    async take(count: number) {
      while (held < count && !ended) await pull();
      if (held < count) throw new Error("The backup's zip ends early");
      const out = new Uint8Array(count);
      advance(count, out);
      return out;
    },
    async skipTo(target: number) {
      while (position < target) {
        if (!held) await pull();
        if (!held) throw new Error("The backup's zip ends early");
        advance(Math.min(held, target - position));
      }
    },
    async finish() {
      while (!ended) await pull();
      pending = [];
      held = 0;
    },
  };
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const typeFor = (key: string, manifest: Map<string, ManifestFile>) =>
  manifest.get(`data/${key}`)?.contentType ??
  (key.endsWith(".json") ? "application/json" : "application/octet-stream");

/** Counts in the app's main documents: residents, circles, pages. */
function countsOf(documents: { directory: unknown; circles: unknown; pages: unknown }) {
  const length = (value: unknown, field: string) => {
    const list = (value as Record<string, unknown> | null)?.[field];
    return Array.isArray(list) ? list.length : 0;
  };
  return {
    residents: length(documents.directory, "people"),
    circles: length(documents.circles, "circles"),
    pages: length(documents.pages, "pages"),
  };
}

const describeCounts = (counts: ReturnType<typeof countsOf>) =>
  `${counts.residents} residents, ${counts.circles} circles, ${counts.pages} pages`;

export type RestoreOutcome = { refused: string } | { report: RestoreReport };

/** Restore a backup into an empty bucket, and check it. */
export async function restoreBackup(
  backup: BackupRecord,
  target: RestoreTarget
): Promise<RestoreOutcome> {
  const started = Date.now();
  const s3 = await import("@aws-sdk/client-s3");
  const client = await s3Client(target);
  const where = `${new URL(target.endpoint).host}/${target.bucket}`;

  // Only ever into an empty bucket.
  try {
    const first = await client.send(
      new s3.ListObjectsV2Command({ Bucket: target.bucket, MaxKeys: 1 })
    );
    if (first.KeyCount || first.Contents?.length)
      return { refused: "That bucket isn't empty — restore into a new, empty bucket" };
  } catch (error) {
    return { refused: `CVC couldn't open that bucket — ${describe(error)}` };
  }

  // The zip's index, and its manifest (each file's fingerprint and type).
  const key = zipKey(backup.id);
  const tail = await readBinaryRange(
    key,
    Math.max(0, backup.bytes - TAIL_BYTES),
    Math.min(backup.bytes, TAIL_BYTES)
  );
  if (!tail) return { refused: "That backup's zip isn't kept any more" };
  let entries: ZipEntry[];
  try {
    const directory = findCentralDirectory(tail);
    const index = await readBinaryRange(key, directory.offset, directory.size);
    entries = parseCentralDirectory(index ?? new Uint8Array(0), directory.entries);
  } catch (error) {
    return { refused: (error as Error).message };
  }
  entries.sort((a, b) => a.offset - b.offset);
  const manifestEntry = entries.find((entry) => insidePath(entry.name) === "manifest.json");
  const unpack = (entry: ZipEntry, raw: Uint8Array) =>
    entry.method === 8 ? inflateSync(raw) : raw;
  const readEntry = async (entry: ZipEntry) => {
    const header = await readBinaryRange(key, entry.offset, 30);
    const start = entry.offset + localDataStart(header ?? new Uint8Array(0));
    return unpack(
      entry,
      (await readBinaryRange(key, start, entry.compressedSize)) ?? new Uint8Array()
    );
  };
  let manifestFiles: ManifestFile[] = [];
  try {
    if (!manifestEntry) throw new Error("no manifest");
    const parsed = JSON.parse(new TextDecoder().decode(await readEntry(manifestEntry)));
    manifestFiles = Array.isArray(parsed?.files) ? parsed.files : [];
  } catch {
    return { refused: "That backup's manifest can't be read" };
  }
  const manifest = new Map(manifestFiles.map((file) => [file.path, file]));

  // Stream the zip once: each file under data/, cut out at its place, written at its key.
  const source = await readBinaryStream(key);
  if (!source) return { refused: "That backup's zip isn't kept any more" };
  const zipHash = createHash("sha256");
  const zip = sequential(source, zipHash);
  const restored = new Map<string, { bytes: number; sha256: string }>();
  const writing = new Set<Promise<void>>();
  let heldForWriting = 0;
  let failure: string | null = null;
  const write = async (objectKey: string, body: Uint8Array) => {
    while (writing.size >= PARALLEL || (writing.size && heldForWriting + body.length > MAX_HELD))
      await Promise.race(writing);
    heldForWriting += body.length;
    const task = client
      .send(
        new s3.PutObjectCommand({
          Bucket: target.bucket,
          Key: objectKey,
          Body: body,
          ContentType: typeFor(objectKey, manifest),
        })
      )
      .then(
        () => undefined,
        (error) => {
          failure ??= `Writing ${objectKey} failed — ${describe(error)}`;
        }
      )
      .finally(() => {
        heldForWriting -= body.length;
        writing.delete(task);
      });
    writing.add(task);
  };
  try {
    for (const entry of entries) {
      const path = insidePath(entry.name);
      if (!path.startsWith("data/") || path.endsWith("/")) continue;
      await zip.skipTo(entry.offset);
      const header = await zip.take(30);
      await zip.skipTo(entry.offset + localDataStart(header));
      const body = unpack(entry, await zip.take(entry.compressedSize));
      const objectKey = path.slice("data/".length);
      restored.set(objectKey, { bytes: body.length, sha256: sha256(body) });
      await write(objectKey, body);
      if (failure) break;
    }
    if (!failure) await zip.finish();
  } catch (error) {
    failure ??= (error as Error).message;
  }
  await Promise.all(Array.from(writing));
  if (failure) return { refused: failure };

  // Check it.
  const checks: RestoreCheck[] = [];
  const zipSha = zipHash.digest("hex");
  checks.push({
    label: "The backup's zip is intact",
    ok: zipSha === backup.sha256,
    detail: zipSha === backup.sha256 ? "Its fingerprint matches" : "Its fingerprint has changed",
  });

  const compared = compareRestore(manifestFiles, restored);
  const wrong = [...compared.missing, ...compared.changed, ...compared.extra];
  checks.push({
    label: "Every file restored exactly as it was backed up",
    ok: !wrong.length,
    detail: wrong.length
      ? `${compared.missing.length} missing, ${compared.changed.length} changed, ${
          compared.extra.length
        } not in the manifest (${wrong.slice(0, 3).join(", ")})`
      : `${restored.size} files, each fingerprint matches the manifest`,
  });

  let listed = 0;
  let listedBytes = 0;
  const listedKeys = new Set<string>();
  try {
    let token: string | undefined;
    do {
      const page = await client.send(
        new s3.ListObjectsV2Command({
          Bucket: target.bucket,
          ...(token ? { ContinuationToken: token } : {}),
        })
      );
      for (const object of page.Contents ?? []) {
        listed += 1;
        listedBytes += object.Size ?? 0;
        if (object.Key) listedKeys.add(object.Key);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  } catch (error) {
    checks.push({ label: "The new bucket lists them", ok: false, detail: describe(error) });
  }
  const expectedBytes = Array.from(restored.values()).reduce((sum, file) => sum + file.bytes, 0);
  const sameKeys =
    listedKeys.size === restored.size &&
    Array.from(restored.keys()).every((objectKey) => listedKeys.has(objectKey));
  checks.push({
    label: "The new bucket holds exactly those files",
    ok: sameKeys && listedBytes === expectedBytes,
    detail: `${listed} files, ${listedBytes.toLocaleString()} bytes`,
  });

  // Types: a few files of each kind, as the bucket says they are.
  const samples = [
    ...Array.from(restored.keys())
      .filter((k) => !k.endsWith(".json"))
      .slice(0, 4),
    ...Array.from(restored.keys())
      .filter((k) => k.endsWith(".json"))
      .slice(0, 1),
  ];
  const typed = manifestFiles.some((file) => file.contentType);
  const typeProblems: string[] = [];
  for (const sample of samples) {
    try {
      const head = await client.send(
        new s3.HeadObjectCommand({ Bucket: target.bucket, Key: sample })
      );
      if (head.ContentType !== typeFor(sample, manifest))
        typeProblems.push(`${sample} is ${head.ContentType ?? "untyped"}`);
    } catch (error) {
      typeProblems.push(`${sample}: ${describe(error)}`);
    }
  }
  checks.push({
    label: "Files keep their types",
    ok: typed && !typeProblems.length,
    detail: !typed
      ? "This backup was made before types were recorded — make a new one to restore"
      : typeProblems.length
        ? typeProblems.slice(0, 2).join("; ")
        : `${samples.length} checked`,
  });

  // The app's main documents, read back from the new bucket, beside CVC's now.
  const readBack = async (objectKey: string) => {
    try {
      const result = await client.send(
        new s3.GetObjectCommand({ Bucket: target.bucket, Key: objectKey })
      );
      return JSON.parse((await result.Body?.transformToString()) ?? "null");
    } catch {
      return null;
    }
  };
  const [directory, circles, pages, nowDirectory, nowCircles, nowPages] = await Promise.all([
    readBack("directory/directory.json"),
    readBack("circles/circles.json"),
    readBack("wiki/pages.json"),
    readJson("directory/directory.json"),
    readJson("circles/circles.json"),
    readJson("wiki/pages.json"),
  ]);
  const there = countsOf({ directory, circles, pages });
  const now = countsOf({ directory: nowDirectory, circles: nowCircles, pages: nowPages });
  const same = JSON.stringify(there) === JSON.stringify(now);
  checks.push({
    label: "The directory, circles and pages read back",
    ok: !!directory && there.residents > 0,
    detail: `${describeCounts(there)} — ${
      same ? "the same as CVC now" : `CVC now has ${describeCounts(now)} (changed since)`
    }`,
  });

  return {
    report: {
      ok: checks.every((check) => check.ok),
      backupId: backup.id,
      target: where,
      objects: restored.size,
      bytes: expectedBytes,
      seconds: Math.round((Date.now() - started) / 1000),
      checks,
    },
  };
}
