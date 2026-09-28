import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * Appreciations are short public thank-you notes that rotate through the
 * footer of every page. They live as one document in the shared store, capped
 * to the most recent entries so the document stays small.
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
  author: { id: string; name: string },
  input: { to: string | null; message: string }
): Promise<Appreciation> {
  const appreciation: Appreciation = {
    id: randomUUID(),
    authorId: author.id,
    authorName: author.name,
    to: input.to,
    message: input.message,
    createdAt: new Date().toISOString(),
  };
  await enqueue(KEY, async () => {
    const items = normalize(await readJson(KEY));
    await writeJson(KEY, { items: [...items, appreciation].slice(-MAX_STORED) });
  });
  return appreciation;
}

/** Remove an appreciation: its author or an admin may. */
export async function removeAppreciation(
  id: string,
  actor: { id: string; admin: boolean }
): Promise<"removed" | "not_found" | "forbidden"> {
  return enqueue(KEY, async () => {
    const items = normalize(await readJson(KEY));
    const item = items.find((entry) => entry.id === id);
    if (!item) return "not_found" as const;
    if (!actor.admin && item.authorId !== actor.id) return "forbidden" as const;
    await writeJson(KEY, { items: items.filter((entry) => entry.id !== id) });
    return "removed" as const;
  });
}
