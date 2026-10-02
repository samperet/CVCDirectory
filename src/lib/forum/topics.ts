import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * Forum topics: the forum's front page lists them, and each holds its own
 * discussions. "General" always exists and holds any discussion without a
 * topic (including every discussion from before topics existed, or whose
 * topic is gone). Admins
 * add, rename, and remove topics; removing one moves its discussions to
 * General.
 */

export interface ForumTopic {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export const GENERAL_TOPIC_ID = "general";
const GENERAL: ForumTopic = {
  id: GENERAL_TOPIC_ID,
  name: "General",
  description: "Anything that doesn't fit another topic.",
  createdAt: "2024-01-01T00:00:00.000Z",
};

/** The retired built-in "Community Forum" (its discussions now show in General). */
const isRetiredCommunityForum = (topic: ForumTopic) =>
  topic.id === "community" && topic.name === "Community Forum";

const KEY = "forum/topics.json";
const MAX_TOPICS = 50;

const name = z
  .string()
  .trim()
  .min(2, "Name the topic (at least 2 characters)")
  .max(60, "Topic names must be 60 characters or fewer");
const description = z.string().trim().max(300, "Descriptions must be 300 characters or fewer");

export const topicInputSchema = z.object({
  name,
  description: description.optional().transform((value) => value || null),
});
export const topicUpdateSchema = z
  .object({
    name: name.optional(),
    description: description
      .nullable()
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null)),
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined,
    "Nothing to update"
  );

export const isTopicId = (id: string) => /^[a-z0-9-]{1,40}$/.test(id);

function normalize(raw: unknown): ForumTopic[] {
  const topics = (raw as { topics?: unknown } | null)?.topics;
  const list = Array.isArray(topics) ? (topics as ForumTopic[]) : [];
  // General first, then the rest in the order they were added.
  const general = list.find((topic) => topic.id === GENERAL_TOPIC_ID) ?? GENERAL;
  return [
    general,
    ...list.filter((topic) => topic.id !== GENERAL_TOPIC_ID && !isRetiredCommunityForum(topic)),
  ];
}

/** Every topic: General, then the rest in the order they were added. */
export async function listTopics(): Promise<ForumTopic[]> {
  return normalize(await readJson(KEY));
}

export async function getTopic(id: string) {
  return (await listTopics()).find((topic) => topic.id === id) ?? null;
}

type Failure = "not_found" | "exists" | "full" | "general";
type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure };

async function mutate<T>(
  change: (topics: ForumTopic[]) => { topics: ForumTopic[]; value: T } | Failure
): Promise<Result<T>> {
  return enqueue<Result<T>>(KEY, async () => {
    const result = change(normalize(await readJson(KEY)));
    if (typeof result === "string") return { ok: false, reason: result };
    await writeJson(KEY, { topics: result.topics });
    return { ok: true, value: result.value };
  });
}

const slugFor = (text: string, taken: Set<string>) => {
  const base =
    text
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "topic";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
};

export function createTopic(input: { name: string; description: string | null }) {
  return mutate<ForumTopic>((topics) => {
    if (topics.some((topic) => topic.name.toLowerCase() === input.name.toLowerCase()))
      return "exists";
    if (topics.length >= MAX_TOPICS) return "full";
    const topic: ForumTopic = {
      id: slugFor(input.name, new Set(topics.map((entry) => entry.id))),
      ...input,
      createdAt: new Date().toISOString(),
    };
    return { topics: [...topics, topic], value: topic };
  });
}

export function updateTopic(id: string, update: { name?: string; description?: string | null }) {
  return mutate<ForumTopic>((topics) => {
    const current = topics.find((topic) => topic.id === id);
    if (!current) return "not_found";
    if (
      update.name &&
      topics.some(
        (topic) => topic.id !== id && topic.name.toLowerCase() === update.name!.toLowerCase()
      )
    )
      return "exists";
    const next = {
      ...current,
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.description !== undefined ? { description: update.description } : {}),
    };
    return { topics: topics.map((topic) => (topic.id === id ? next : topic)), value: next };
  });
}

/** Remove a topic (never General); the caller moves its discussions to General. */
export function deleteTopic(id: string) {
  return mutate<null>((topics) => {
    if (id === GENERAL_TOPIC_ID) return "general";
    if (!topics.some((topic) => topic.id === id)) return "not_found";
    return { topics: topics.filter((topic) => topic.id !== id), value: null };
  });
}
