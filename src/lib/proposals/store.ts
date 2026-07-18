import { promises as fs } from "fs";
import path from "path";
import { getSeedProposal, listSeedSlugs } from "./content";
import { ProposalContent, ProposalDocument, ProposalState } from "./types";

/**
 * Each proposal lives as one JSON document (content + interaction state) in
 * Cloudflare R2 (S3-compatible API), with an index document listing all
 * slugs. When the R2 environment variables are not configured (local
 * development, preview builds), storage falls back to JSON files under
 * .data/ so the feature stays fully functional without credentials.
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

export function emptyState(): ProposalState {
  return { questions: [], extensionClicks: [], meetingRequests: [], updatedAt: null };
}

function normalizeState(raw: unknown): ProposalState {
  const state = (raw ?? {}) as Partial<ProposalState>;
  return {
    questions: Array.isArray(state.questions) ? state.questions : [],
    extensionClicks: Array.isArray(state.extensionClicks) ? state.extensionClicks : [],
    meetingRequests: Array.isArray(state.meetingRequests) ? state.meetingRequests : [],
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : null,
  };
}

function normalizeDocument(slug: string, raw: unknown): ProposalDocument | null {
  const seed = getSeedProposal(slug);
  if (!raw) {
    return seed ? { content: seed, state: emptyState() } : null;
  }
  const doc = raw as { content?: ProposalContent; state?: unknown; questions?: unknown };
  if (doc.content && typeof doc.content === "object") {
    return { content: { ...doc.content, slug }, state: normalizeState(doc.state) };
  }
  // Legacy shape: the document held interaction state only, content was static.
  if (Array.isArray(doc.questions) && seed) {
    return { content: seed, state: normalizeState(raw) };
  }
  return seed ? { content: seed, state: emptyState() } : null;
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
  return path.join(process.cwd(), ".data", key);
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

async function readJson(key: string): Promise<unknown | null> {
  return isPersistent() ? readJsonFromR2(key) : readJsonFromFile(key);
}

async function writeJson(key: string, value: unknown): Promise<void> {
  return isPersistent() ? writeJsonToR2(key, value) : writeJsonToFile(key, value);
}

function documentKey(slug: string) {
  return `proposals/${slug}.json`;
}

const INDEX_KEY = "proposals/index.json";

async function readIndex(): Promise<string[]> {
  const raw = (await readJson(INDEX_KEY)) as { slugs?: unknown } | null;
  return Array.isArray(raw?.slugs) ? (raw!.slugs as string[]).filter((s) => typeof s === "string") : [];
}

export async function listProposalSlugs(): Promise<string[]> {
  const slugs = new Set([...listSeedSlugs(), ...(await readIndex())]);
  return Array.from(slugs);
}

export async function readProposalDocument(slug: string): Promise<ProposalDocument | null> {
  return normalizeDocument(slug, await readJson(documentKey(slug)));
}

// Serialize read-modify-write cycles per key within this server instance to
// avoid clobbering concurrent submissions.
const mutationQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  mutationQueues.set(key, next);
  return next;
}

export async function mutateProposalDocument(
  slug: string,
  mutate: (doc: ProposalDocument) => ProposalDocument
): Promise<ProposalDocument | null> {
  return enqueue(documentKey(slug), async () => {
    const doc = normalizeDocument(slug, await readJson(documentKey(slug)));
    if (!doc) return null;
    const updated = mutate(doc);
    updated.state = { ...updated.state, updatedAt: new Date().toISOString() };
    await writeJson(documentKey(slug), updated);
    return updated;
  });
}

export async function createProposalDocument(content: ProposalContent): Promise<ProposalDocument> {
  const doc: ProposalDocument = { content, state: emptyState() };
  await enqueue(documentKey(content.slug), () => writeJson(documentKey(content.slug), doc));
  await enqueue(INDEX_KEY, async () => {
    const slugs = await readIndex();
    if (!slugs.includes(content.slug)) {
      slugs.push(content.slug);
      await writeJson(INDEX_KEY, { slugs });
    }
  });
  return doc;
}
