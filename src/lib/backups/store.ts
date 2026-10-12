import { z } from "zod";
import { deleteBinary, mutateJson, readJson } from "@/lib/storage";
import { hashToken, newToken, seal, unseal } from "./secret";
import { KEEP_BACKUPS, type BackupRecord, type SubscriptionView } from "./shared";

/**
 * Backups kept (`backups/index.json`, the newest ${KEEP_BACKUPS}; each zip at
 * `backups/<id>.zip`, its proof at `backups/<id>.ots`) and who signed up for
 * them (`backups/subscribers.json`, by person id): an email when one's
 * ready, a feed (only its token's hash kept), and storage of their own (its
 * secret sealed). Backups themselves leave all of `backups/` out.
 */

const INDEX = "backups/index.json";
const SUBSCRIBERS = "backups/subscribers.json";
export const zipKey = (id: string) => `backups/${id}.zip`;
export const otsKey = (id: string) => `backups/${id}.ots`;

const normalizeIndex = (raw: unknown): BackupRecord[] => {
  const backups = (raw as { backups?: unknown } | null)?.backups;
  return Array.isArray(backups) ? (backups as BackupRecord[]) : [];
};

/** The backups kept, newest first. */
export async function listBackups(): Promise<BackupRecord[]> {
  return normalizeIndex(await readJson(INDEX));
}

export async function findBackup(id: string) {
  return (await listBackups()).find((backup) => backup.id === id) ?? null;
}

/** Keep a new backup (and let the oldest beyond ${KEEP_BACKUPS} go). */
export async function recordBackup(record: BackupRecord) {
  const dropped = await mutateJson<BackupRecord[]>(INDEX, (raw) => {
    const all = [record, ...normalizeIndex(raw)];
    return { value: { backups: all.slice(0, KEEP_BACKUPS) }, result: all.slice(KEEP_BACKUPS) };
  });
  await Promise.all(
    dropped.flatMap((old) => [
      deleteBinary(zipKey(old.id)).catch(() => undefined),
      deleteBinary(otsKey(old.id)).catch(() => undefined),
    ])
  );
}

// --- Who signed up ---------------------------------------------------------------------------

export interface StorageTarget {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  /** Sealed (`secret.ts`). */
  secret: string;
  last?: { at: string; ok: boolean; error?: string };
}

export interface Subscriber {
  personId: string;
  name: string;
  email: boolean;
  feedHash?: string | null;
  storage?: StorageTarget | null;
  since: string;
}

const normalizeSubscribers = (raw: unknown): Record<string, Subscriber> => {
  const subscribers = (raw as { subscribers?: unknown } | null)?.subscribers;
  return subscribers && typeof subscribers === "object"
    ? (subscribers as Record<string, Subscriber>)
    : {};
};

export async function listSubscribers(): Promise<Subscriber[]> {
  return Object.values(normalizeSubscribers(await readJson(SUBSCRIBERS)));
}

/** How a resident's sign-up looks to them. */
export function viewOf(subscriber: Subscriber | undefined): SubscriptionView {
  const storage = subscriber?.storage;
  return {
    email: !!subscriber?.email,
    feed: !!subscriber?.feedHash,
    storage: storage
      ? {
          endpoint: storage.endpoint,
          region: storage.region,
          bucket: storage.bucket,
          prefix: storage.prefix,
          accessKeyId: storage.accessKeyId,
          ...(storage.last ? { last: storage.last } : {}),
        }
      : null,
  };
}

export async function subscriptionOf(personId: string) {
  return viewOf(normalizeSubscribers(await readJson(SUBSCRIBERS))[personId]);
}

type Person = { personId: string; name: string };

/** Change someone's sign-up; one with nothing left is forgotten. */
function change(person: Person, edit: (current: Subscriber) => Subscriber) {
  return mutateJson<Subscriber>(SUBSCRIBERS, (raw) => {
    const all = normalizeSubscribers(raw);
    const current = all[person.personId] ?? {
      personId: person.personId,
      name: person.name,
      email: false,
      since: new Date().toISOString(),
    };
    const next = { ...edit(current), name: person.name };
    const rest = { ...all };
    if (next.email || next.feedHash || next.storage) rest[person.personId] = next;
    else delete rest[person.personId];
    return { value: { subscribers: rest }, result: next };
  });
}

export const setEmail = (person: Person, email: boolean) =>
  change(person, (current) => ({ ...current, email }));

/** A new feed (any old one stops working): its token, shown this once. */
export async function makeFeed(person: Person) {
  const { token, hash } = newToken();
  await change(person, (current) => ({ ...current, feedHash: hash }));
  return token;
}

export const dropFeed = (person: Person) =>
  change(person, (current) => ({ ...current, feedHash: null }));

/** Whose feed this token is, or null. */
export async function feedOwner(token: string): Promise<Subscriber | null> {
  const hash = hashToken(token);
  return (await listSubscribers()).find((entry) => entry.feedHash === hash) ?? null;
}

/** Only tests write to storage on this machine, over plain http (BACKUP_STORAGE_ALLOW_HTTP=1, never set on Vercel). */
const localAllowed = () => process.env.BACKUP_STORAGE_ALLOW_HTTP === "1";

/** Addresses on this machine or a private network: never somewhere to send backups. */
const PRIVATE_HOST =
  /^(localhost|.*\.(localhost|local|internal)|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[.*\])$/i;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

export const storageSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url("Give the storage's address, like https://s3.us-west-002.backblazeb2.com")
    .refine(
      (url) => url.startsWith("https://") || localAllowed(),
      "The storage's address must start with https://"
    )
    .refine(
      (url) => localAllowed() || !PRIVATE_HOST.test(hostOf(url)),
      "That address isn't on the internet"
    ),
  region: z.string().trim().max(40).default("auto"),
  bucket: z.string().trim().min(3, "Name the bucket").max(63),
  prefix: z
    .string()
    .trim()
    .max(200)
    .default("cvc-backups/")
    .transform((value) => (value && !value.endsWith("/") ? `${value}/` : value)),
  accessKeyId: z.string().trim().min(4, "Give the access key's id").max(200),
  secretAccessKey: z.string().trim().min(8, "Give the access key's secret").max(400),
});
export type StorageInput = z.infer<typeof storageSchema>;

export const setStorage = (person: Person, input: StorageInput) =>
  change(person, (current) => ({
    ...current,
    storage: {
      endpoint: input.endpoint,
      region: input.region || "auto",
      bucket: input.bucket,
      prefix: input.prefix,
      accessKeyId: input.accessKeyId,
      secret: seal(input.secretAccessKey),
    },
  }));

export const dropStorage = (person: Person) =>
  change(person, (current) => ({ ...current, storage: null }));

/** Note how pushing a backup to someone's storage went. */
export const noteStorage = (personId: string, last: { at: string; ok: boolean; error?: string }) =>
  mutateJson(SUBSCRIBERS, (raw) => {
    const all = normalizeSubscribers(raw);
    const current = all[personId];
    if (!current?.storage) return { write: false, result: null };
    return {
      value: {
        subscribers: { ...all, [personId]: { ...current, storage: { ...current.storage, last } } },
      },
      result: null,
    };
  });

/** A target's secret, opened (null if it can't be: AUTH_SECRET changed). */
export const storageSecret = (target: StorageTarget) => unseal(target.secret);
