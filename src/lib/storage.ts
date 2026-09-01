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

const R2_ENV_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Field aliases accepted inside a combined R2 variable. */
const FIELD_ALIASES: Record<keyof R2Config, string[]> = {
  accountId: ["r2_account_id", "accountid", "account_id", "account", "cf_account_id"],
  accessKeyId: ["r2_access_key_id", "accesskeyid", "access_key_id", "access_key", "aws_access_key_id"],
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
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
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
  const accountId = pick("accountId") ?? (endpoint ? accountIdFromEndpoint(endpoint) ?? undefined : undefined);
  const bucket = pick("bucket");

  const first = (aliases: string[]) => aliases.map((alias) => pairs[alias]).find(Boolean);
  const tokenId = first(TOKEN_ID_ALIASES);
  const tokenValue = first(TOKEN_VALUE_ALIASES);

  const accessKeyId = pick("accessKeyId") ?? tokenId;
  const secretAccessKey =
    pick("secretAccessKey") ?? (tokenValue ? secretFromToken(tokenValue) : undefined);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function r2Config(): R2Config | null {
  // Preferred: four discrete environment variables.
  const values = R2_ENV_KEYS.map((key) => process.env[key]);
  if (values.every(Boolean)) {
    const [accountId, accessKeyId, secretAccessKey, bucket] = values as string[];
    return { accountId, accessKeyId, secretAccessKey, bucket };
  }

  // A Cloudflare API token supplied as discrete variables.
  const tokenId = process.env.R2_TOKEN_ID;
  const tokenValue = process.env.R2_API_TOKEN;
  const account = process.env.R2_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET;
  if (tokenId && tokenValue && account && bucketName) {
    return {
      accountId: account,
      accessKeyId: tokenId,
      secretAccessKey: secretFromToken(tokenValue),
      bucket: bucketName,
    };
  }

  // Fallback: a single combined variable holding the credentials.
  const combined = process.env.R2 ?? process.env.R2_CONFIG ?? process.env.R2_CREDENTIALS;
  return combined ? fromCombined(combined) : null;
}

export function isPersistent() {
  return r2Config() !== null;
}

async function getS3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const config = r2Config();
  if (!config) throw new Error("R2 is not configured");
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

export async function readJson(key: string): Promise<unknown | null> {
  return isPersistent() ? readJsonFromR2(key) : readJsonFromFile(key);
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  return isPersistent() ? writeJsonToR2(key, value) : writeJsonToFile(key, value);
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
