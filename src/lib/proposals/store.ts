import { promises as fs } from "fs";
import path from "path";
import { ProposalState } from "./types";

/**
 * Proposal state lives as one JSON document per proposal in Cloudflare R2
 * (S3-compatible API). When the R2 environment variables are not configured
 * (local development, preview builds), state falls back to a JSON file under
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

function objectKey(slug: string) {
  return `proposals/${slug}.json`;
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

async function readFromR2(slug: string): Promise<ProposalState> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey(slug) })
    );
    const body = await result.Body?.transformToString();
    return normalizeState(body ? JSON.parse(body) : null);
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") {
      return emptyState();
    }
    throw error;
  }
}

async function writeToR2(slug: string, state: ProposalState): Promise<void> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const config = r2Config()!;
  const client = await getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey(slug),
      Body: JSON.stringify(state, null, 2),
      ContentType: "application/json",
    })
  );
}

function localFilePath(slug: string) {
  return path.join(process.cwd(), ".data", "proposals", `${slug}.json`);
}

async function readFromFile(slug: string): Promise<ProposalState> {
  try {
    const raw = await fs.readFile(localFilePath(slug), "utf-8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    return emptyState();
  }
}

async function writeToFile(slug: string, state: ProposalState): Promise<void> {
  const filePath = localFilePath(slug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function readProposalState(slug: string): Promise<ProposalState> {
  return isPersistent() ? readFromR2(slug) : readFromFile(slug);
}

async function writeProposalState(slug: string, state: ProposalState): Promise<void> {
  return isPersistent() ? writeToR2(slug, state) : writeToFile(slug, state);
}

// Serialize read-modify-write cycles per proposal within this server instance
// to avoid clobbering concurrent submissions.
const mutationQueues = new Map<string, Promise<unknown>>();

export async function mutateProposalState(
  slug: string,
  mutate: (state: ProposalState) => ProposalState
): Promise<ProposalState> {
  const previous = mutationQueues.get(slug) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const state = await readProposalState(slug);
      const updated = { ...mutate(state), updatedAt: new Date().toISOString() };
      await writeProposalState(slug, updated);
      return updated;
    });
  mutationQueues.set(slug, next);
  return next;
}
