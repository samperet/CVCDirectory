import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteBinary, mutateJson, readJson, writeBinary } from "@/lib/storage";
import type { ImageFile } from "@/lib/images";
import type { Actor } from "@/lib/auth/actor";

/**
 * The loan library: things residents are happy to lend, each with a photo
 * if its owner adds one (kept as a binary, `library/photos/<id>`). Every
 * item belongs to the resident who listed it (taken from their signed-in
 * account), and only they (or an admin) can edit it, change its photo, mark
 * it lent out or back, or remove it.
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
  /** Its photo, if it has one (the bytes are stored apart; see `loanPhotoUrl`). */
  photo?: { contentType: string; updatedAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional();

export const loanItemInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Name the item (at least 2 characters)")
    .max(80, "Name must be 80 characters or fewer"),
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
export const MAX_LOAN_PHOTO_BYTES = 3 * 1024 * 1024;
export const loanPhotoKey = (id: string) => `library/photos/${id}`;

/** An item's photo address (versioned, so it can be cached), or null. */
export const loanPhotoUrl = (item: Pick<LoanItem, "id" | "photo">) =>
  item.photo
    ? `/api/loan-items/${item.id}/photo?v=${encodeURIComponent(item.photo.updatedAt)}`
    : null;

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
  return mutateJson<LoanItem | "limit">(KEY, (raw) => {
    const items = normalize(raw);
    if (items.filter((item) => item.ownerPersonId === owner.personId).length >= MAX_PER_PERSON)
      return { write: false, result: "limit" };
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
    return { value: { items: [...items, item] }, result: item };
  });
}

export type Failure = "not_found" | "forbidden";
type OwnerResult<T> = { ok: true; value: T } | { ok: false; reason: Failure };

/** Its owner, or an admin, may change an item. */
type LoanActor = Pick<Actor, "personId" | "admin">;
const mayChange = (item: LoanItem, actor: LoanActor) =>
  actor.admin || (!!actor.personId && item.ownerPersonId === actor.personId);

export async function updateLoanItem(
  actor: LoanActor,
  id: string,
  update: z.infer<typeof loanItemUpdateSchema>
): Promise<OwnerResult<LoanItem>> {
  return mutateJson<OwnerResult<LoanItem>>(KEY, (raw) => {
    const items = normalize(raw);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { write: false, result: { ok: false, reason: "not_found" } };
    if (!mayChange(items[index], actor))
      return { write: false, result: { ok: false, reason: "forbidden" } };
    const next = { ...items[index], ...update, updatedAt: new Date().toISOString() };
    // Returning an item clears who had it.
    if (update.available === true) next.lentTo = null;
    if (next.lentTo === "") next.lentTo = null;
    const updated = [...items];
    updated[index] = next;
    return { value: { items: updated }, result: { ok: true, value: next } };
  });
}

/** Add, replace, or take off an item's photo (its owner, or an admin). */
export async function setLoanItemPhoto(
  actor: LoanActor,
  id: string,
  photo: ImageFile | null
): Promise<OwnerResult<LoanItem>> {
  const item = (await listLoanItems()).find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "not_found" };
  if (!mayChange(item, actor)) return { ok: false, reason: "forbidden" };
  if (photo) await writeBinary(loanPhotoKey(id), photo);
  else await deleteBinary(loanPhotoKey(id)).catch(() => undefined);
  return mutateJson<OwnerResult<LoanItem>>(KEY, (raw) => {
    const items = normalize(raw);
    const index = items.findIndex((entry) => entry.id === id);
    if (index === -1) return { write: false, result: { ok: false, reason: "not_found" } };
    const now = new Date().toISOString();
    const next: LoanItem = {
      ...items[index],
      photo: photo ? { contentType: photo.contentType, updatedAt: now } : null,
      updatedAt: now,
    };
    const updated = [...items];
    updated[index] = next;
    return { value: { items: updated }, result: { ok: true, value: next } };
  });
}

export async function removeLoanItem(actor: LoanActor, id: string): Promise<OwnerResult<null>> {
  const result = await mutateJson<OwnerResult<null>>(KEY, (raw) => {
    const items = normalize(raw);
    const item = items.find((entry) => entry.id === id);
    if (!item) return { write: false, result: { ok: false, reason: "not_found" } };
    if (!mayChange(item, actor))
      return { write: false, result: { ok: false, reason: "forbidden" } };
    return {
      value: { items: items.filter((entry) => entry.id !== id) },
      result: { ok: true, value: null },
    };
  });
  if (result.ok) await deleteBinary(loanPhotoKey(id)).catch(() => undefined);
  return result;
}
