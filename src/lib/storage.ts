import { promises as fs } from "fs";
import path from "path";

/**
 * Shared JSON-document storage. Documents live in Cloudflare R2 (S3-compatible
 * API) when the R2 environment variables are configured; otherwise storage
 * falls back to JSON files under .data/ (or /tmp/.data on Vercel, where the
 * deployment bundle is read-only) so features stay functional without
 * credentials — with the caveat that fallback data is ephemeral.
 */

const R2_ENV_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

function r2Config() {
  const values = R2_ENV_KEYS.map((key) => process.env[key]);
  if (values.some((value) => !value)) return null;
  const [accountId, accessKeyId, secretAccessKey, bucket] = values as string[];
  return { accountId, accessKeyId, secretAccessKey, bucket };
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
