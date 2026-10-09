import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

/**
 * Shared JSON-document storage. Documents live in Cloudflare R2 (S3-compatible
 * API) when R2 credentials are configured — either as four discrete
 * R2_* variables or as a single combined R2 variable; otherwise storage
 * falls back to JSON files under .data/ (or /tmp/.data on Vercel, where the
 * deployment bundle is read-only) so features stay functional without
 * credentials — with the caveat that fallback data is ephemeral.
 */

const R2_ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Field aliases accepted inside a combined R2 variable. */
const FIELD_ALIASES: Record<keyof R2Config, string[]> = {
  accountId: ["r2_account_id", "accountid", "account_id", "account", "cf_account_id"],
  accessKeyId: [
    "r2_access_key_id",
    "accesskeyid",
    "access_key_id",
    "access_key",
    "aws_access_key_id",
  ],
  secretAccessKey: [
    "r2_secret_access_key",
    "secretaccesskey",
    "secret_access_key",
    "secret_key",
    "aws_secret_access_key",
  ],
  bucket: ["r2_bucket", "bucket", "bucketname", "bucket_name", "r2_bucket_name"],
};

/**
 * A Cloudflare API token can drive the S3 API too: the Access Key ID is the
 * token's id, and the Secret Access Key is the SHA-256 of the token value.
 * See https://developers.cloudflare.com/r2/api/tokens/
 */
const TOKEN_ID_ALIASES = ["r2_token_id", "token_id", "tokenid", "api_token_id", "id"];
const TOKEN_VALUE_ALIASES = ["r2_api_token", "api_token", "token_value", "token", "value"];

function secretFromToken(tokenValue: string) {
  return createHash("sha256").update(tokenValue).digest("hex");
}

/** Pull the account ID out of an R2 S3 endpoint, e.g. https://<id>.r2.cloudflarestorage.com */
function accountIdFromEndpoint(endpoint: string): string | null {
  const match = endpoint.match(/https?:\/\/([a-z0-9]+)\.r2\.cloudflarestorage\.com/i);
  return match ? match[1] : null;
}

/**
 * Reduce whatever was pasted to the bare account id. The S3 endpoint is
 * https://<account>.r2.cloudflarestorage.com, and its wildcard certificate
 * covers exactly one label — so a value carrying a scheme, a full host, or a
 * path yields a hostname the TLS handshake rejects (alert 40). Accept the
 * common paste shapes and reduce them to the single label.
 */
function normalizeAccountId(raw: string): string {
  let value = raw.trim().replace(/^["']|["']$/g, "");
  const fromEndpoint = accountIdFromEndpoint(value);
  if (fromEndpoint) return fromEndpoint;
  // Strip scheme and anything from the first slash onward.
  value = value.replace(/^https?:\/\//i, "").split("/")[0];
  // A bare host still carries the R2 suffix; keep only the first label.
  if (value.toLowerCase().endsWith(".r2.cloudflarestorage.com")) {
    value = value.split(".")[0];
  }
  // SNI is conventionally lowercase; a mixed-case name can be rejected with a
  // TLS handshake failure.
  return value.trim().toLowerCase();
}

/**
 * Parse a single combined variable holding all four credentials. Accepts a
 * JSON object, or KEY=VALUE pairs separated by newlines, commas, or
 * semicolons — the shapes people naturally paste into one Vercel variable.
 */
function parseCombined(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  const pairs: Record<string, string> = {};

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") pairs[key.toLowerCase()] = value;
      }
      return pairs;
    } catch {
      // Fall through to KEY=VALUE parsing.
    }
  }

  for (const line of trimmed.split(/[\n,;]+/)) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && value) pairs[key] = value;
  }
  return pairs;
}

function fromCombined(raw: string): R2Config | null {
  const pairs = parseCombined(raw);
  const pick = (field: keyof R2Config) => {
    for (const alias of FIELD_ALIASES[field]) {
      if (pairs[alias]) return pairs[alias];
    }
    return undefined;
  };

  const endpoint = pairs["endpoint"] ?? pairs["r2_endpoint"] ?? pairs["url"];
  const accountId =
    pick("accountId") ?? (endpoint ? accountIdFromEndpoint(endpoint) ?? undefined : undefined);
  const bucket = pick("bucket");

  const first = (aliases: string[]) => aliases.map((alias) => pairs[alias]).find(Boolean);
  const tokenId = first(TOKEN_ID_ALIASES);
  const tokenValue = first(TOKEN_VALUE_ALIASES);

  const accessKeyId = pick("accessKeyId") ?? tokenId;
  const secretAccessKey =
    pick("secretAccessKey") ?? (tokenValue ? secretFromToken(tokenValue) : undefined);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    accountId: normalizeAccountId(accountId),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucket: bucket.trim(),
  };
}

export function r2Config(): R2Config | null {
  // Preferred: four discrete environment variables.
  const values = R2_ENV_KEYS.map((key) => process.env[key]);
  if (values.every(Boolean)) {
    const [accountId, accessKeyId, secretAccessKey, bucket] = values as string[];
    return {
      accountId: normalizeAccountId(accountId),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      bucket: bucket.trim(),
    };
  }

  // A Cloudflare API token supplied as discrete variables.
  const tokenId = process.env.R2_TOKEN_ID;
  const tokenValue = process.env.R2_API_TOKEN;
  const account = process.env.R2_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET;
  if (tokenId && tokenValue && account && bucketName) {
    return {
      accountId: normalizeAccountId(account),
      accessKeyId: tokenId.trim(),
      secretAccessKey: secretFromToken(tokenValue.trim()),
      bucket: bucketName.trim(),
    };
  }

  // Fallback: a single combined variable holding the credentials.
  const combined = process.env.R2 ?? process.env.R2_CONFIG ?? process.env.R2_CREDENTIALS;
  return combined ? fromCombined(combined) : null;
}

export function isPersistent() {
  return r2Config() !== null;
}

let describedConfig = false;

/**
 * Describe the resolved R2 target once, in the runtime logs, to make
 * misconfiguration diagnosable. The account id and bucket are not secrets —
 * they appear in every R2 endpoint URL — and these logs are private to the
 * project. The access key id is reported by length only, and the secret is
 * never touched.
 */
function describeConfigOnce(config: R2Config) {
  if (describedConfig) return;
  describedConfig = true;
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  console.warn(
    `[r2] endpoint=${endpoint} bucket=${config.bucket} ` +
      `accountIdLength=${config.accountId.length} ` +
      `accountIdIsHex=${/^[a-f0-9]{32}$/.test(config.accountId)} ` +
      `accessKeyIdLength=${config.accessKeyId.length} ` +
      `secretLength=${config.secretAccessKey.length}`
  );
}

async function getS3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const config = r2Config();
  if (!config) throw new Error("R2 is not configured");
  describeConfigOnce(config);
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function readJsonFromR2(key: string): Promise<unknown | null> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const body = await result.Body?.transformToString();
    return body ? JSON.parse(body) : null;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") {
      return null;
    }
    throw error;
  }
}

async function writeJsonToR2(key: string, value: unknown): Promise<void> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: JSON.stringify(value, null, 2),
      ContentType: "application/json",
    })
  );
}

function localFilePath(key: string) {
  const base = process.env.VERCEL ? path.join("/tmp", ".data") : path.join(process.cwd(), ".data");
  return path.join(base, key);
}

async function readJsonFromFile(key: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(localFilePath(key), "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function writeJsonToFile(key: string, value: unknown): Promise<void> {
  const filePath = localFilePath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

let r2Degraded = false;

/**
 * R2 is the durable store, but a credential or endpoint misconfiguration must
 * not take the whole site down: fall back to the local file store and log
 * loudly. The fallback is ephemeral on Vercel, so degraded mode keeps the app
 * usable while the configuration is corrected rather than serving errors.
 */
function noteDegraded(operation: string, error: unknown) {
  const err = error as { name?: string; code?: string; message?: string };
  if (!r2Degraded) {
    r2Degraded = true;
    console.error(
      `[r2] ${operation} failed, falling back to ephemeral local storage — ` +
        `${err.name ?? "Error"}${err.code ? ` (${err.code})` : ""}: ${err.message ?? "unknown"}`
    );
  }
}

export async function readJson(key: string): Promise<unknown | null> {
  if (!isPersistent()) return readJsonFromFile(key);
  try {
    return await readJsonFromR2(key);
  } catch (error) {
    noteDegraded("read", error);
    return readJsonFromFile(key);
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  if (!isPersistent()) return writeJsonToFile(key, value);
  try {
    return await writeJsonToR2(key, value);
  } catch (error) {
    noteDegraded("write", error);
    return writeJsonToFile(key, value);
  }
}

async function deleteFromR2(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

/** Delete a document. Missing documents are not an error. */
export async function deleteJson(key: string): Promise<void> {
  if (isPersistent()) {
    try {
      return await deleteFromR2(key);
    } catch (error) {
      noteDegraded("delete", error);
    }
  }
  await fs.rm(localFilePath(key), { force: true });
}

// --- Binary objects (profile photos) --------------------------------------

export interface BinaryObject {
  bytes: Uint8Array;
  contentType: string;
}

async function readBinaryFromR2(key: string): Promise<BinaryObject | null> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    return bytes ? { bytes, contentType: result.ContentType ?? "application/octet-stream" } : null;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}

async function writeBinaryToR2(key: string, object: BinaryObject): Promise<void> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: object.bytes,
      ContentType: object.contentType,
    })
  );
}

// Local fallback keeps the content type in a sidecar file.
async function readBinaryFromFile(key: string): Promise<BinaryObject | null> {
  try {
    const [bytes, contentType] = await Promise.all([
      fs.readFile(localFilePath(key)),
      fs.readFile(`${localFilePath(key)}.type`, "utf-8"),
    ]);
    return { bytes: new Uint8Array(bytes), contentType };
  } catch {
    return null;
  }
}

async function writeBinaryToFile(key: string, object: BinaryObject): Promise<void> {
  const filePath = localFilePath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, object.bytes);
  await fs.writeFile(`${filePath}.type`, object.contentType, "utf-8");
}

export async function readBinary(key: string): Promise<BinaryObject | null> {
  if (!isPersistent()) return readBinaryFromFile(key);
  try {
    return await readBinaryFromR2(key);
  } catch (error) {
    noteDegraded("read", error);
    return readBinaryFromFile(key);
  }
}

export async function writeBinary(key: string, object: BinaryObject): Promise<void> {
  if (!isPersistent()) return writeBinaryToFile(key, object);
  try {
    return await writeBinaryToR2(key, object);
  } catch (error) {
    noteDegraded("write", error);
    return writeBinaryToFile(key, object);
  }
}

/** Delete a binary object (and its local content-type sidecar). */
export async function deleteBinary(key: string): Promise<void> {
  await deleteJson(key);
  await fs.rm(`${localFilePath(key)}.type`, { force: true });
}

async function copyInR2(from: string, to: string): Promise<boolean> {
  const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: config.bucket,
        CopySource: encodeURI(`${config.bucket}/${from}`),
        Key: to,
      })
    );
    return true;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") return false;
    throw error;
  }
}

/**
 * Copy a binary object to another key — within R2, so a large file never
 * passes through the server (should R2 refuse the copy, it's read and
 * written again instead). False when there's nothing at `from`.
 */
export async function copyBinary(from: string, to: string): Promise<boolean> {
  if (isPersistent()) {
    try {
      return await copyInR2(from, to);
    } catch (error) {
      console.warn("[r2] copy failed; copying through the server", (error as Error)?.name);
    }
  }
  const object = await readBinary(from);
  if (!object) return false;
  await writeBinary(to, object);
  return true;
}

/**
 * Write to R2 or fail. Unlike writeJson, this never degrades to the local
 * file store: for imports and other writes that must not silently land in
 * ephemeral storage, a failure is reported to the caller instead.
 */
export async function writeJsonDurable(key: string, value: unknown): Promise<void> {
  if (!isPersistent()) {
    throw new Error("R2 is not configured; refusing to write to ephemeral storage");
  }
  await writeJsonToR2(key, value);
}

/** True only when R2 is configured AND has not failed at runtime. */
export function isDurable() {
  return isPersistent() && !r2Degraded;
}

// Serialize read-modify-write cycles per key within this server instance to
// avoid clobbering concurrent submissions.
const mutationQueues = new Map<string, Promise<unknown>>();

export function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  mutationQueues.set(key, next);
  return next;
}

/**
 * Read, change, and write a document safely even when several server
 * instances change it at once: the write only lands if nobody else wrote
 * since it was read (R2 conditional put), and is retried from a fresh read
 * otherwise. `change` returns the new value and a result, or just a result
 * (`write: false`) to leave the document as it is.
 */
export function mutateJson<T>(
  key: string,
  change: (current: unknown | null) => { value: unknown; result: T } | { write: false; result: T }
): Promise<T> {
  return enqueue(key, async () => {
    if (isPersistent() && !conditionalUnsupported) {
      try {
        for (let attempt = 0; attempt < 6; attempt++) {
          const { value: current, etag } = await readJsonWithEtag(key);
          const next = change(current);
          if (!("value" in next)) return next.result;
          if (await writeJsonIfUnchanged(key, next.value, etag)) return next.result;
          await new Promise((resolve) =>
            setTimeout(resolve, 40 + Math.random() * 120 * (attempt + 1))
          );
        }
        throw new Error("This was being changed by several people at once; try again");
      } catch (error) {
        if ((error as Error).message?.startsWith("This was being changed")) throw error;
        // Anything else: carry on below with a plain read and write (which falls back only if R2 itself is down).
        console.warn(
          `[r2] conditional update of ${key} failed (${
            (error as { name?: string }).name ?? "Error"
          }); writing plainly`
        );
      }
    }
    const next = change(await readJson(key));
    if ("value" in next) await writeJson(key, next.value);
    return next.result;
  });
}

/**
 * What `parse` makes of the document — or, when there isn't one yet, of the
 * document `seed()` makes, written in its place (write-if-absent, so when two
 * instances seed at once the first to land is what both return). `parse`
 * returns null for "not there yet".
 */
export function readOrSeedJson<T>(
  key: string,
  parse: (raw: unknown) => T | null,
  seed: () => unknown
): Promise<T> {
  return mutateJson<T>(key, (current) => {
    const stored = parse(current);
    if (stored) return { write: false, result: stored };
    const value = seed();
    return { value, result: parse(value) as T };
  });
}

let conditionalUnsupported = false;

async function readJsonWithEtag(
  key: string
): Promise<{ value: unknown | null; etag: string | null }> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const body = await result.Body?.transformToString();
    return { value: body ? JSON.parse(body) : null, etag: result.ETag ?? null };
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") return { value: null, etag: null };
    throw error;
  }
}

/** Write only if the document is still the version read (or still absent); false if someone else got there first. */
async function writeJsonIfUnchanged(
  key: string,
  value: unknown,
  etag: string | null
): Promise<boolean> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: JSON.stringify(value, null, 2),
        ContentType: "application/json",
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
      })
    );
    return true;
  } catch (error) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    const status = err.$metadata?.httpStatusCode;
    if (
      status === 412 ||
      err.name === "PreconditionFailed" ||
      status === 409 ||
      err.name === "ConditionalRequestConflict"
    )
      return false;
    if (status === 501 || status === 400 || err.name === "NotImplemented") {
      // A store without conditional writes: fall back to plain writes (one instance's queue still applies).
      conditionalUnsupported = true;
      console.warn("[r2] conditional writes unsupported; using plain writes");
      await writeJsonToR2(key, value);
      return true;
    }
    throw error;
  }
}

/**
 * A short-lived link that downloads an object straight from R2, for files
 * too large to pass through a serverless function. Returns null without R2
 * (local development), where callers serve the bytes themselves.
 */
export async function presignedDownloadUrl(
  key: string,
  options: { fileName: string; contentType: string; inline: boolean; expiresInSeconds?: number }
): Promise<string | null> {
  if (!isPersistent()) return null;
  const [{ GetObjectCommand }, { getSignedUrl }] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
  ]);
  const config = r2Config()!;
  const client = await getS3Client();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentType: options.contentType,
    ResponseContentDisposition: contentDisposition(options.fileName, options.inline),
    ResponseCacheControl: "private, no-store",
  });
  return getSignedUrl(client, command, { expiresIn: options.expiresInSeconds ?? 300 });
}

/** `attachment; filename="minutes.pdf"; filename*=UTF-8''minutes.pdf`, safe for any file name. */
export function contentDisposition(fileName: string, inline: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${
    inline ? "inline" : "attachment"
  }; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
