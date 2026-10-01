import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";
import type { Circle } from "@/lib/directory/types";
import { readPages } from "@/lib/wiki/store";
import { PIN_KINDS, type Pin, type PinNoteRef, type PinTarget } from "./shared";

/**
 * Pins: a wiki page stuck to somewhere it's useful — the community
 * dashboard, a circle, a person's own dashboard, a task, a document, or a
 * forum discussion. A page can be pinned in many places, and each place can
 * hold many pages. A circle's own information is the pages pinned to it:
 * pages start by being added on a circle (and pinned there), while pages
 * started from inside another page aren't. All pins live in one document
 * (`pins.json`). A pin can end on a date (`until`), after which it's no
 * longer shown.
 */

const KEY = "pins.json";
/** A circle's information can hold as many pages as its wiki; other places, a handful. */
export const maxPinsOn = (target: PinTarget) => (target.kind === "circle" ? 200 : 20);
const VERSION = 2;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15");
export const targetSchema = z.object({ kind: z.enum(PIN_KINDS), id: z.string().min(1).max(120) });
export const noteRefSchema = z.object({ circleId: z.string().min(1).max(80), pageId: z.string().min(1).max(80) });
export const pinInputSchema = z.object({
  note: noteRefSchema,
  target: targetSchema,
  until: isoDate.nullable().default(null),
  reason: z.string().trim().max(140, "Keep the reason to 140 characters").nullable().default(null),
});

type Stored = { version?: number; pins: Pin[] };
const normalize = (raw: unknown): Stored | null => {
  const value = raw as Partial<Stored> | null;
  return Array.isArray(value?.pins) ? { version: value!.version, pins: value!.pins } : null;
};
const save = (pins: Pin[]) => writeJson(KEY, { version: VERSION, pins });

/** Today, as YYYY-MM-DD, in Vermont. */
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const live = (pin: Pin, on = today()) => !pin.until || pin.until >= on;

export const sameTarget = (a: PinTarget, b: PinTarget) => a.kind === b.kind && a.id === b.id;
export const sameNote = (a: PinNoteRef, b: PinNoteRef) => a.circleId === b.circleId && a.pageId === b.pageId;

/**
 * Before pins listed a circle's information, every page showed in its
 * circle's Wiki section. So the first time they're read, every page that
 * wasn't started from another page is pinned to its own circle — nothing
 * disappears from circle pages. (This covers the pages circles once pinned
 * by address, too.)
 */
async function migrate(circles: Circle[], pins: Pin[]): Promise<Pin[]> {
  const added: Pin[] = [];
  for (const circle of circles) {
    for (const page of await readPages(circle.id)) {
      if (page.parentId) continue;
      const note = { circleId: circle.id, pageId: page.id };
      const target = { kind: "circle" as const, id: circle.id };
      if (pins.some((pin) => sameNote(pin.note, note) && sameTarget(pin.target, target))) continue;
      added.push({ id: randomUUID(), note, target, pinnedBy: { personId: null, name: page.createdBy.name }, pinnedAt: page.createdAt, until: null, reason: null });
    }
  }
  return [...pins, ...added];
}

async function load(circles: Circle[]): Promise<Stored> {
  const stored = normalize(await readJson(KEY));
  if (stored && stored.version === VERSION) return stored;
  return enqueue(KEY, async () => {
    const again = normalize(await readJson(KEY));
    if (again && again.version === VERSION) return again;
    const pins = await migrate(circles, again?.pins ?? []);
    await save(pins);
    return { version: VERSION, pins };
  });
}

/** Every pin, including ones past their date (for the map and clean-ups). */
export async function allPins(circles: Circle[]): Promise<Pin[]> {
  return (await load(circles)).pins;
}

/** The pins showing now on a target, or of a note, newest first. */
export async function listPins(circles: Circle[], filter: { target?: PinTarget; note?: PinNoteRef; kind?: PinTarget["kind"] }): Promise<Pin[]> {
  const on = today();
  return (await allPins(circles)).filter(
    (pin) =>
      live(pin, on) &&
      (!filter.target || sameTarget(pin.target, filter.target)) &&
      (!filter.note || sameNote(pin.note, filter.note)) &&
      (!filter.kind || pin.target.kind === filter.kind)
  ).sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
}

type Failure = "exists" | "full" | "not_found";
export type PinResult = { ok: true; pin: Pin } | { ok: false; reason: Failure };

async function mutate<T>(circles: Circle[], change: (pins: Pin[]) => { pins: Pin[]; result: T }): Promise<T> {
  await load(circles);
  return enqueue(KEY, async () => {
    const stored = normalize(await readJson(KEY)) ?? { pins: [] };
    const { pins, result } = change(stored.pins);
    if (pins !== stored.pins) await save(pins);
    return result;
  });
}

export function addPin(circles: Circle[], input: z.infer<typeof pinInputSchema>, by: Pin["pinnedBy"]) {
  return mutate<PinResult>(circles, (pins) => {
    const on = today();
    const existing = pins.find((pin) => sameTarget(pin.target, input.target) && sameNote(pin.note, input.note));
    // Pinning again where a pin has run out renews it.
    if (existing && live(existing, on)) return { pins, result: { ok: false, reason: "exists" } };
    const others = pins.filter((pin) => pin !== existing);
    if (others.filter((pin) => sameTarget(pin.target, input.target) && live(pin, on)).length >= maxPinsOn(input.target)) {
      return { pins, result: { ok: false, reason: "full" } };
    }
    const pin: Pin = { id: randomUUID(), note: input.note, target: input.target, pinnedBy: by, pinnedAt: new Date().toISOString(), until: input.until, reason: input.reason || null };
    return { pins: [...others, pin], result: { ok: true, pin } };
  });
}

export async function getPin(circles: Circle[], id: string): Promise<Pin | null> {
  return (await allPins(circles)).find((pin) => pin.id === id) ?? null;
}

export function removePin(circles: Circle[], id: string) {
  return mutate<boolean>(circles, (pins) => {
    const next = pins.filter((pin) => pin.id !== id);
    return next.length === pins.length ? { pins, result: false } : { pins: next, result: true };
  });
}

/** Take down pins: of a note, on a target, or anything matching `match` (when what they refer to is deleted). */
export function removePinsWhere(match: (pin: Pin) => boolean) {
  // Before any pins exist there's nothing to take down (and old circle pins
  // still carry over when they're first read).
  return enqueue<number>(KEY, async () => {
    const stored = normalize(await readJson(KEY));
    if (!stored) return 0;
    const pins = stored.pins.filter((pin) => !match(pin));
    // Keeps the stored version: a document not yet migrated still gets migrated when next read.
    if (pins.length !== stored.pins.length) await writeJson(KEY, { ...(stored.version ? { version: stored.version } : {}), pins });
    return stored.pins.length - pins.length;
  });
}

/** Take down the pins on something that's been deleted. */
export const removePinsOn = (target: PinTarget) => removePinsWhere((pin) => sameTarget(pin.target, target));

/** A deleted circle takes its pages' pins, and the pins on it and its tasks, with it. */
export const circleGone = (circleId: string) => (pin: Pin) =>
  pin.note.circleId === circleId || (pin.target.kind === "circle" && pin.target.id === circleId) || (pin.target.kind === "task" && pin.target.id.startsWith(`${circleId}:`));
