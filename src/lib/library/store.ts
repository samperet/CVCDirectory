import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * The loan library: things residents are happy to lend. Every item belongs
 * to the resident who listed it (taken from their signed-in account), and
 * only they can edit it, mark it lent out or back, or remove it.
 */

export interface LoanItem {
  id: string;
  ownerPersonId: string;
  /** Name when listed; the directory's current name is preferred when shown. */
  ownerName: string;
  title: string;
  category: string;
  description: string;
  available: boolean;
  /** Who has it, when lent out. Free text so it can be a neighbor or anyone. */
  lentTo: string | null;
  createdAt: string;
  updatedAt: string;
}

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional();

export const loanItemInputSchema = z.object({
  title: z.string().trim().min(2, "Name the item (at least 2 characters)").max(80, "Name must be 80 characters or fewer"),
  category: optionalText(40, "Category").transform((value) => value || "General"),
  description: optionalText(500, "Description").transform((value) => value ?? ""),
});

export const loanItemUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(80).optional(),
    category: z.string().trim().min(1).max(40).optional(),
    description: z.string().trim().max(500).optional(),
    available: z.boolean().optional(),
    lentTo: z.string().trim().max(80).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

const KEY = "library/items.json";
const MAX_PER_PERSON = 50;

function normalize(raw: unknown): LoanItem[] {
  const items = (raw as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as LoanItem[]) : [];
}

export async function listLoanItems(): Promise<LoanItem[]> {
  return normalize(await readJson(KEY));
}

export async function addLoanItem(
  owner: { personId: string; name: string },
  input: { title: string; category: string; description: string }
): Promise<LoanItem | "limit"> {
  return enqueue(KEY, async () => {
    const items = normalize(await readJson(KEY));
    if (items.filter((item) => item.ownerPersonId === owner.personId).length >= MAX_PER_PERSON) return "limit" as const;
    const now = new Date().toISOString();
    const item: LoanItem = {
      id: randomUUID(),
      ownerPersonId: owner.personId,
      ownerName: owner.name,
      title: input.title,
      category: input.category,
      description: input.description,
      available: true,
      lentTo: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeJson(KEY, { items: [...items, item] });
    return item;
  });
}

type OwnerResult<T> = { ok: true; value: T } | { ok: false; reason: "not_found" | "forbidden" };

export async function updateLoanItem(
  personId: string,
  id: string,
  update: z.infer<typeof loanItemUpdateSchema>
): Promise<OwnerResult<LoanItem>> {
  return enqueue<OwnerResult<LoanItem>>(KEY, async () => {
    const items = normalize(await readJson(KEY));
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, reason: "not_found" };
    if (items[index].ownerPersonId !== personId) return { ok: false, reason: "forbidden" };
    const next = { ...items[index], ...update, updatedAt: new Date().toISOString() };
    // Returning an item clears who had it.
    if (update.available === true) next.lentTo = null;
    if (next.lentTo === "") next.lentTo = null;
    const updated = [...items];
    updated[index] = next;
    await writeJson(KEY, { items: updated });
    return { ok: true, value: next };
  });
}

export async function removeLoanItem(personId: string, id: string): Promise<OwnerResult<null>> {
  return enqueue<OwnerResult<null>>(KEY, async () => {
    const items = normalize(await readJson(KEY));
    const item = items.find((entry) => entry.id === id);
    if (!item) return { ok: false, reason: "not_found" };
    if (item.ownerPersonId !== personId) return { ok: false, reason: "forbidden" };
    await writeJson(KEY, { items: items.filter((entry) => entry.id !== id) });
    return { ok: true, value: null };
  });
}
