import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";

/**
 * Appreciations are short public thank-you notes that rotate through the
 * footer of every page, and are all listed at /appreciations. They live as one
 * document in the shared store, capped to the most recent entries so the
 * document stays small.
 */

export interface Appreciation {
  id: string;
  authorId: string;
  authorName: string;
  to: string | null;
  message: string;
  createdAt: string;
}

export const appreciationInputSchema = z.object({
  to: z
    .string()
    .trim()
    .max(80, "Recipient must be 80 characters or fewer")
    .optional()
    .transform((value) => (value ? value : null)),
  message: z
    .string()
    .trim()
    .min(3, "Appreciation must be at least 3 characters")
    .max(500, "Appreciation must be 500 characters or fewer"),
});

const KEY = "appreciations/index.json";
const MAX_STORED = 500;

function normalize(raw: unknown): Appreciation[] {
  const items = (raw as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as Appreciation[]) : [];
}

/** Newest first. */
export async function listAppreciations(limit = 50): Promise<Appreciation[]> {
  const items = normalize(await readJson(KEY));
  return items.slice(-limit).reverse();
}

export async function addAppreciation(
  author: Pick<Actor, "userId" | "name">,
  input: { to: string | null; message: string }
): Promise<Appreciation> {
  const appreciation: Appreciation = {
    id: randomUUID(),
    authorId: author.userId,
    authorName: author.name,
    to: input.to,
    message: input.message,
    createdAt: new Date().toISOString(),
  };
  await mutateJson(KEY, (raw) => ({
    value: { items: [...normalize(raw), appreciation].slice(-MAX_STORED) },
    result: null,
  }));
  return appreciation;
}

export const MAX_APPRECIATIONS = MAX_STORED;

/** Remove an appreciation: any resident may (the community tends them together). */
export async function removeAppreciation(id: string): Promise<"removed" | "not_found"> {
  return mutateJson<"removed" | "not_found">(KEY, (raw) => {
    const items = normalize(raw);
    if (!items.some((entry) => entry.id === id)) return { write: false, result: "not_found" };
    return { value: { items: items.filter((entry) => entry.id !== id) }, result: "removed" };
  });
}
