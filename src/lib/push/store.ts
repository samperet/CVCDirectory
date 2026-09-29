import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * Devices signed up for push notifications, and each resident's choice of
 * what to be notified about (shared by all their devices).
 */

export const TOPICS = {
  discussions: "New forum discussions",
  replies: "Replies in discussions you started or joined",
  appreciations: "New appreciations",
  photos: "New photos",
  resources: "New recommendations, and comments on yours",
  library: "New things to borrow in the loan library",
  documents: "New and updated documents in circles",
} as const;

export type Topic = keyof typeof TOPICS;
export type Preferences = Record<Topic, boolean>;

export const DEFAULT_PREFERENCES: Preferences = {
  discussions: true,
  replies: true,
  appreciations: true,
  photos: true,
  resources: true,
  library: true,
  documents: true,
};

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  createdAt: string;
}

export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export const preferencesSchema = z
  .object(Object.fromEntries(Object.keys(TOPICS).map((topic) => [topic, z.boolean().optional()])) as Record<Topic, z.ZodOptional<z.ZodBoolean>>)
  .strict();

const SUBSCRIPTIONS = "push/subscriptions.json";
const PREFERENCES = "push/preferences.json";
const MAX_SUBSCRIPTIONS = 2000;

function normalizeSubscriptions(raw: unknown): PushSubscriptionRecord[] {
  const list = (raw as { subscriptions?: unknown } | null)?.subscriptions;
  return Array.isArray(list) ? (list as PushSubscriptionRecord[]) : [];
}

export async function listSubscriptions(): Promise<PushSubscriptionRecord[]> {
  return normalizeSubscriptions(await readJson(SUBSCRIPTIONS));
}

/** Save a device's subscription for this resident (a device that changes hands moves to its new owner). */
export async function saveSubscription(userId: string, subscription: z.infer<typeof subscriptionSchema>) {
  await enqueue(SUBSCRIPTIONS, async () => {
    const others = normalizeSubscriptions(await readJson(SUBSCRIPTIONS)).filter((entry) => entry.endpoint !== subscription.endpoint);
    const record: PushSubscriptionRecord = { ...subscription, userId, createdAt: new Date().toISOString() };
    await writeJson(SUBSCRIPTIONS, { subscriptions: [...others, record].slice(-MAX_SUBSCRIPTIONS) });
  });
}

/** Forget subscriptions by endpoint (turned off, or rejected by the push service as expired). */
export async function removeSubscriptions(endpoints: string[], userId?: string) {
  if (!endpoints.length) return;
  const drop = new Set(endpoints);
  await enqueue(SUBSCRIPTIONS, async () => {
    const list = normalizeSubscriptions(await readJson(SUBSCRIPTIONS));
    const kept = list.filter((entry) => !(drop.has(entry.endpoint) && (!userId || entry.userId === userId)));
    if (kept.length !== list.length) await writeJson(SUBSCRIPTIONS, { subscriptions: kept });
  });
}

/** Forget every device and preference of these accounts (closed accounts get no more notifications). */
export async function removeUserPush(userIds: string[]) {
  if (!userIds.length) return;
  const ids = new Set(userIds);
  await enqueue(SUBSCRIPTIONS, async () => {
    const list = normalizeSubscriptions(await readJson(SUBSCRIPTIONS));
    const kept = list.filter((entry) => !ids.has(entry.userId));
    if (kept.length !== list.length) await writeJson(SUBSCRIPTIONS, { subscriptions: kept });
  });
  await enqueue(PREFERENCES, async () => {
    const map = await readPreferenceMap();
    const kept = Object.fromEntries(Object.entries(map).filter(([userId]) => !ids.has(userId)));
    if (Object.keys(kept).length !== Object.keys(map).length) await writeJson(PREFERENCES, { byUser: kept });
  });
}

async function readPreferenceMap(): Promise<Record<string, Partial<Preferences>>> {
  const raw = (await readJson(PREFERENCES)) as { byUser?: Record<string, Partial<Preferences>> } | null;
  return raw?.byUser && typeof raw.byUser === "object" ? raw.byUser : {};
}

export async function allPreferences(): Promise<Record<string, Preferences>> {
  const map = await readPreferenceMap();
  return Object.fromEntries(Object.entries(map).map(([userId, prefs]) => [userId, { ...DEFAULT_PREFERENCES, ...prefs }]));
}

export async function preferencesFor(userId: string): Promise<Preferences> {
  return { ...DEFAULT_PREFERENCES, ...(await readPreferenceMap())[userId] };
}

export async function updatePreferences(userId: string, update: Partial<Preferences>): Promise<Preferences> {
  return enqueue(PREFERENCES, async () => {
    const map = await readPreferenceMap();
    const next = { ...DEFAULT_PREFERENCES, ...map[userId], ...update };
    await writeJson(PREFERENCES, { byUser: { ...map, [userId]: next } });
    return next;
  });
}
