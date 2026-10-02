import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteBinary, mutateJson, readJson, writeBinary } from "@/lib/storage";

/**
 * Homes for sale at CVC, listed by admins and the Board and shown — with
 * their contact details — on the public homepage while they're available or
 * under contract. One document (`homes/listings.json`), plus an optional
 * photo per listing (`homes/photos/<id>`).
 */

export type HomeStatus = "available" | "pending" | "sold";

export interface HomeListing {
  id: string;
  title: string;
  unit: number | null;
  price: string | null;
  /** e.g. "3 bedrooms · 2 baths · 1,450 sq ft" */
  details: string | null;
  description: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  /** A listing elsewhere (e.g. the realtor's page). */
  link: string | null;
  status: HomeStatus;
  photo: { contentType: string; updatedAt: string } | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`);
const optional = (max: number, label: string) =>
  text(max, label)
    .nullable()
    .optional()
    .transform((value) => value || null);

export const homeInputSchema = z
  .object({
    title: text(120, "Title").min(
      3,
      "Give the listing a title, e.g. “3-bedroom home on the green”"
    ),
    unit: z.coerce
      .number()
      .int()
      .min(1)
      .max(999)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    price: optional(40, "Price"),
    details: optional(160, "Details"),
    description: optional(2000, "Description"),
    contactName: text(80, "Contact name").min(2, "Who should buyers contact?"),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .email("Enter a valid email address")
      .nullable()
      .optional()
      .or(z.literal(""))
      .transform((value) => value || null),
    contactPhone: optional(30, "Phone"),
    link: z
      .string()
      .trim()
      .max(500)
      .url("Enter a full web address, starting with https://")
      .refine((value) => /^https?:\/\//i.test(value), "Enter a web address starting with https://")
      .nullable()
      .optional()
      .or(z.literal(""))
      .transform((value) => value || null),
    status: z.enum(["available", "pending", "sold"]).default("available"),
  })
  .refine((value) => value.contactEmail || value.contactPhone, {
    message: "Give an email address or a phone number for buyers",
    path: ["contactEmail"],
  });

export type HomeInput = z.infer<typeof homeInputSchema>;

const KEY = "homes/listings.json";
const MAX_LISTINGS = 50;
export const MAX_HOME_PHOTO_BYTES = 3 * 1024 * 1024;
export const photoKey = (id: string) => `homes/photos/${id}`;
export const isHomeId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

function normalize(raw: unknown): HomeListing[] {
  const homes = (raw as { homes?: unknown } | null)?.homes;
  return Array.isArray(homes) ? (homes as HomeListing[]) : [];
}

/** Every listing, newest first. */
export async function listHomes(): Promise<HomeListing[]> {
  return normalize(await readJson(KEY))
    .slice()
    .reverse();
}

/** What the public homepage shows: available homes, then those under contract. */
export async function publicHomes(): Promise<HomeListing[]> {
  const homes = await listHomes();
  return [
    ...homes.filter((home) => home.status === "available"),
    ...homes.filter((home) => home.status === "pending"),
  ];
}

export async function getHome(id: string) {
  return normalize(await readJson(KEY)).find((home) => home.id === id) ?? null;
}

type Result = { ok: true; home: HomeListing | null } | { ok: false; reason: "not_found" | "full" };

async function mutate(
  change: (
    homes: HomeListing[]
  ) => { homes: HomeListing[]; home: HomeListing | null } | "not_found" | "full"
): Promise<Result> {
  return mutateJson<Result>(KEY, (raw) => {
    const result = change(normalize(raw));
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    return { value: { homes: result.homes }, result: { ok: true, home: result.home } };
  });
}

export function createHome(input: HomeInput, by: string) {
  return mutate((homes) => {
    if (homes.length >= MAX_LISTINGS) return "full";
    const now = new Date().toISOString();
    const home: HomeListing = {
      id: randomUUID(),
      ...input,
      photo: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: by,
    };
    return { homes: [...homes, home], home };
  });
}

export function updateHome(id: string, input: Partial<HomeInput>, by: string) {
  return mutate((homes) => {
    const home = homes.find((entry) => entry.id === id);
    if (!home) return "not_found";
    const updated: HomeListing = {
      ...home,
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy: by,
    };
    return { homes: homes.map((entry) => (entry.id === id ? updated : entry)), home: updated };
  });
}

export async function deleteHome(id: string) {
  const result = await mutate((homes) =>
    homes.some((home) => home.id === id)
      ? { homes: homes.filter((home) => home.id !== id), home: null }
      : "not_found"
  );
  if (result.ok) await deleteBinary(photoKey(id)).catch(() => undefined);
  return result;
}

export async function setHomePhoto(
  id: string,
  photo: { bytes: Uint8Array; contentType: string } | null,
  by: string
) {
  if (photo) await writeBinary(photoKey(id), photo);
  else await deleteBinary(photoKey(id)).catch(() => undefined);
  return mutate((homes) => {
    const home = homes.find((entry) => entry.id === id);
    if (!home) return "not_found";
    const updated: HomeListing = {
      ...home,
      photo: photo ? { contentType: photo.contentType, updatedAt: new Date().toISOString() } : null,
      updatedAt: new Date().toISOString(),
      updatedBy: by,
    };
    return { homes: homes.map((entry) => (entry.id === id ? updated : entry)), home: updated };
  });
}

/** A listing's photo address (versioned, so it can be cached). */
export const homePhotoUrl = (home: HomeListing) =>
  home.photo ? `/api/homes/${home.id}/photo?v=${encodeURIComponent(home.photo.updatedAt)}` : null;
