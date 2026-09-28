import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";
import type { Circle, CircleSeat } from "@/lib/directory/types";

/**
 * Circles are managed in the app. The store is seeded once from the imported
 * spreadsheet (members only — the sheet's empty placeholder seats are
 * dropped); after that it is the source of truth and re-imports don't touch it.
 * Every member is a directory resident.
 */

const KEY = "circles/circles.json";
export const BOARD_ID = "board";

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`);

export const circleInputSchema = z.object({
  name: text(80, "Name").min(2, "Name the circle (at least 2 characters)"),
  code: text(8, "Short code")
    .min(1, "Give the circle a short code, like LCC")
    .regex(/^[A-Za-z0-9&+\- ]+$/, "Short code can use letters, numbers, &, +, and -"),
  description: text(1000, "Description").optional().transform((value) => value || null),
});

export const circleUpdateSchema = circleInputSchema.partial().refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const memberInputSchema = z.object({
  personId: z.string().regex(/^[a-f0-9]{12}$/, "Choose a resident"),
  position: text(40, "Role").optional().transform((value) => value || null),
  termEnds: text(30, "Term").optional().transform((value) => value || null),
});

export const memberUpdateSchema = z
  .object({
    position: text(40, "Role").nullable().optional().transform((value) => value || null),
    termEnds: text(30, "Term").nullable().optional().transform((value) => value || null),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

function normalize(raw: unknown): Circle[] | null {
  const circles = (raw as { circles?: unknown } | null)?.circles;
  return Array.isArray(circles) ? (circles as Circle[]) : null;
}

function seedFrom(imported: Circle[]): Circle[] {
  return imported.map((circle) => ({
    id: circle.id,
    code: circle.code,
    name: circle.name,
    description: null,
    seats: circle.seats
      .filter((seat) => seat.personId)
      .map((seat) => ({ ...seat, id: randomUUID() })),
  }));
}

/** The managed circles, seeding them from the import the first time. */
export async function readCircles(imported: Circle[]): Promise<Circle[]> {
  const stored = normalize(await readJson(KEY));
  if (stored) return stored;
  return enqueue(KEY, async () => {
    const again = normalize(await readJson(KEY));
    if (again) return again;
    const seeded = seedFrom(imported);
    await writeJson(KEY, { circles: seeded });
    return seeded;
  });
}

type Failure = "not_found" | "exists" | "duplicate_member" | "last_board_member";
export type CircleResult<T = Circle> = { ok: true; value: T } | { ok: false; reason: Failure };

async function mutate<T>(
  imported: Circle[],
  change: (circles: Circle[]) => { circles: Circle[]; value: T } | Failure
): Promise<CircleResult<T>> {
  await readCircles(imported); // make sure the store exists before changing it
  return enqueue<CircleResult<T>>(KEY, async () => {
    const circles = normalize(await readJson(KEY)) ?? [];
    const result = change(circles);
    if (typeof result === "string") return { ok: false, reason: result };
    await writeJson(KEY, { circles: result.circles });
    return { ok: true, value: result.value };
  });
}

function slugFor(input: { code: string; name: string }, taken: Set<string>) {
  const base =
    input.code
      .toLowerCase()
      .replace(/&/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "circle";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export function createCircle(
  imported: Circle[],
  input: { name: string; code: string; description: string | null },
  founder: { personId: string; name: string }
) {
  return mutate(imported, (circles) => {
    if (circles.some((circle) => circle.code.toLowerCase() === input.code.toLowerCase() || circle.name.toLowerCase() === input.name.toLowerCase())) {
      return "exists";
    }
    const circle: Circle = {
      id: slugFor(input, new Set(circles.map((c) => c.id))),
      code: input.code,
      name: input.name,
      description: input.description,
      seats: [{ id: randomUUID(), personId: founder.personId, name: founder.name, position: "Member", termEnds: null }],
    };
    return { circles: [...circles, circle], value: circle };
  });
}

export function updateCircle(imported: Circle[], id: string, update: Partial<{ name: string; code: string; description: string | null }>) {
  return mutate(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1) return "not_found";
    const clash = circles.some(
      (circle) =>
        circle.id !== id &&
        ((update.code && circle.code.toLowerCase() === update.code.toLowerCase()) ||
          (update.name && circle.name.toLowerCase() === update.name.toLowerCase()))
    );
    if (clash) return "exists";
    const next = [...circles];
    next[index] = { ...next[index], ...update };
    return { circles: next, value: next[index] };
  });
}

export function deleteCircle(imported: Circle[], id: string) {
  return mutate<null>(imported, (circles) => {
    if (!circles.some((circle) => circle.id === id)) return "not_found";
    return { circles: circles.filter((circle) => circle.id !== id), value: null };
  });
}

export function addMember(
  imported: Circle[],
  id: string,
  member: { personId: string; name: string; position: string | null; termEnds: string | null }
) {
  return mutate(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1) return "not_found";
    if (circles[index].seats.some((seat) => seat.personId === member.personId)) return "duplicate_member";
    const seat: CircleSeat = { id: randomUUID(), ...member };
    const next = [...circles];
    next[index] = { ...next[index], seats: [...next[index].seats, seat] };
    return { circles: next, value: next[index] };
  });
}

export function updateMember(imported: Circle[], id: string, memberId: string, update: { position?: string | null; termEnds?: string | null }) {
  return mutate(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1 || !circles[index].seats.some((seat) => seat.id === memberId)) return "not_found";
    const next = [...circles];
    next[index] = { ...next[index], seats: next[index].seats.map((seat) => (seat.id === memberId ? { ...seat, ...update } : seat)) };
    return { circles: next, value: next[index] };
  });
}

export function removeMember(imported: Circle[], id: string, memberId: string) {
  return mutate(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1 || !circles[index].seats.some((seat) => seat.id === memberId)) return "not_found";
    const seats = circles[index].seats.filter((seat) => seat.id !== memberId);
    // The Board is who can manage every circle; never leave it empty.
    if (id === BOARD_ID && !seats.some((seat) => seat.personId)) return "last_board_member";
    const next = [...circles];
    next[index] = { ...next[index], seats };
    return { circles: next, value: next[index] };
  });
}
