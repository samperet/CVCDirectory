import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * Resources: residents' recommendations for local services (a plumber, a
 * dentist, a realtor…), grouped by category. Each recommendation names who
 * made it, and residents can like it and comment on it. Everything lives in
 * one document.
 *
 * Ownership is by directory person, so recommendations seeded on a
 * resident's behalf belong to them once they sign in.
 */

export interface ResourceLike {
  userId: string;
  name: string;
}

export interface ResourceComment {
  id: string;
  authorId: string;
  authorPersonId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
}

export interface Recommendation {
  id: string;
  category: string;
  title: string;
  body: string;
  submittedBy: { personId: string | null; name: string };
  createdAt: string;
  editedAt?: string | null;
  likes: ResourceLike[];
  comments: ResourceComment[];
}

const category = z
  .string()
  .trim()
  .min(2, "Choose a category")
  .max(50, "Category must be 50 characters or fewer");
const title = z
  .string()
  .trim()
  .min(2, "Name who or what you recommend")
  .max(120, "Name must be 120 characters or fewer");
const body = z
  .string()
  .trim()
  .min(1, "Say why you recommend them")
  .max(3000, "Keep it to 3000 characters");

export const recommendationInputSchema = z.object({ category, title, body });
export const recommendationUpdateSchema = z
  .object({ category: category.optional(), title: title.optional(), body: body.optional() })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Nothing to update"
  );
export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment can't be empty")
    .max(2000, "Keep comments to 2000 characters"),
});

const KEY = "resources/recommendations.json";
const MAX_RECOMMENDATIONS = 1000;
const MAX_COMMENTS = 300;

export type Actor = { userId: string; personId: string | null; name: string; admin: boolean };
type Failure = "not_found" | "forbidden" | "full";
export type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure };

function normalize(raw: unknown): Recommendation[] {
  const items = (raw as { recommendations?: unknown } | null)?.recommendations;
  return Array.isArray(items)
    ? (items as Recommendation[]).map((item) => ({
        ...item,
        likes: item.likes ?? [],
        comments: item.comments ?? [],
      }))
    : [];
}

export async function listRecommendations(): Promise<Recommendation[]> {
  return normalize(await readJson(KEY));
}

async function mutate<T>(
  change: (items: Recommendation[]) => { items: Recommendation[]; value: T } | Failure
): Promise<Result<T>> {
  return enqueue<Result<T>>(KEY, async () => {
    const outcome = change(normalize(await readJson(KEY)));
    if (typeof outcome === "string") return { ok: false, reason: outcome };
    await writeJson(KEY, { recommendations: outcome.items });
    return { ok: true, value: outcome.value };
  });
}

/** Change one recommendation in place. */
function mutateOne(id: string, change: (item: Recommendation) => Recommendation | Failure) {
  return mutate<Recommendation>((items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return "not_found";
    const next = change(items[index]);
    if (typeof next === "string") return next;
    const updated = [...items];
    updated[index] = next;
    return { items: updated, value: next };
  });
}

const ownsRecommendation = (item: Recommendation, actor: Actor) =>
  actor.admin || (!!actor.personId && item.submittedBy.personId === actor.personId);

export function addRecommendations(
  entries: {
    category: string;
    title: string;
    body: string;
    submittedBy: { personId: string | null; name: string };
  }[]
) {
  return mutate<Recommendation[]>((items) => {
    if (items.length + entries.length > MAX_RECOMMENDATIONS) return "full";
    const now = new Date().toISOString();
    const created = entries.map((entry) => ({
      id: randomUUID(),
      ...entry,
      createdAt: now,
      likes: [],
      comments: [],
    }));
    return { items: [...items, ...created], value: created };
  });
}

export function updateRecommendation(
  id: string,
  actor: Actor,
  update: z.infer<typeof recommendationUpdateSchema>
) {
  return mutateOne(id, (item) =>
    ownsRecommendation(item, actor)
      ? { ...item, ...update, editedAt: new Date().toISOString() }
      : "forbidden"
  );
}

export function removeRecommendation(id: string, actor: Actor) {
  return mutate<null>((items) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return "not_found";
    if (!ownsRecommendation(item, actor)) return "forbidden";
    return { items: items.filter((entry) => entry.id !== id), value: null };
  });
}

export function setLike(id: string, actor: Actor, liked: boolean) {
  return mutateOne(id, (item) => {
    const others = item.likes.filter((like) => like.userId !== actor.userId);
    return {
      ...item,
      likes: liked ? [...others, { userId: actor.userId, name: actor.name }] : others,
    };
  });
}

export function addComment(id: string, actor: Actor, text: string) {
  return mutateOne(id, (item) => {
    if (item.comments.length >= MAX_COMMENTS) return "full";
    const comment: ResourceComment = {
      id: randomUUID(),
      authorId: actor.userId,
      authorPersonId: actor.personId,
      authorName: actor.name,
      body: text,
      createdAt: new Date().toISOString(),
    };
    return { ...item, comments: [...item.comments, comment] };
  });
}

const ownsComment = (comment: ResourceComment, actor: Actor) =>
  actor.admin || comment.authorId === actor.userId;

export function editComment(id: string, commentId: string, actor: Actor, text: string) {
  return mutateOne(id, (item) => {
    const comment = item.comments.find((entry) => entry.id === commentId);
    if (!comment) return "not_found";
    if (!ownsComment(comment, actor)) return "forbidden";
    return {
      ...item,
      comments: item.comments.map((entry) =>
        entry.id === commentId
          ? { ...entry, body: text, editedAt: new Date().toISOString() }
          : entry
      ),
    };
  });
}

export function removeComment(id: string, commentId: string, actor: Actor) {
  return mutateOne(id, (item) => {
    const comment = item.comments.find((entry) => entry.id === commentId);
    if (!comment) return "not_found";
    if (!ownsComment(comment, actor)) return "forbidden";
    return { ...item, comments: item.comments.filter((entry) => entry.id !== commentId) };
  });
}
