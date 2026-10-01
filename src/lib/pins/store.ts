import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueue, readJson, writeJson } from "@/lib/storage";
import type { Circle } from "@/lib/directory/types";
import { readPages } from "@/lib/wiki/store";
import { PIN_KINDS, type Pin, type PinNoteRef, type PinTarget } from "./shared";

/**
 * Pins: a wiki page (a "note") stuck to somewhere it's useful — the
 * community dashboard, a circle, a person's own dashboard, a task, a
 * document, or a forum discussion. A note can be pinned in many places, and
 * each place can hold many notes. All pins live in one document
 * (`pins.json`). A pin can end on a date (`until`), after which it's no
 * longer shown.
 */

const KEY = "pins.json";
export const MAX_PINS_PER_TARGET = 20;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15");
export const targetSchema = z.object({ kind: z.enum(PIN_KINDS), id: z.string().min(1).max(120) });
export const noteRefSchema = z.object({ circleId: z.string().min(1).max(80), pageId: z.string().min(1).max(80) });
export const pinInputSchema = z.object({
  note: noteRefSchema,
  target: targetSchema,
  until: isoDate.nullable().default(null),
  reason: z.string().trim().max(140, "Keep the reason to 140 characters").nullable().default(null),
});

type Stored = { pins: Pin[] };
const normalize = (raw: unknown): Stored | null => {
  const pins = (raw as Partial<Stored> | null)?.pins;
  return Array.isArray(pins) ? { pins } : null;
};

/** Today, as YYYY-MM-DD, in Vermont. */
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const live = (pin: Pin, on = today()) => !pin.until || pin.until >= on;

export const sameTarget = (a: PinTarget, b: PinTarget) => a.kind === b.kind && a.id === b.id;
export const sameNote = (a: PinNoteRef, b: PinNoteRef) => a.circleId === b.circleId && a.pageId === b.pageId;

/**
 * Circles used to pin pages by their addresses (`circle.pinnedWiki`); the
 * first time the pins are read, those become circle pins.
 */
async function migrate(circles: Circle[]): Promise<Stored> {
  const pins: Pin[] = [];
  for (const circle of circles) {
    if (!circle.pinnedWiki?.length) continue;
    const pages = await readPages(circle.id);
    for (const slug of circle.pinnedWiki) {
      const page = pages.find((entry) => entry.slug === slug);
      if (!page) continue;
      pins.push({
        id: randomUUID(),
        note: { circleId: circle.id, pageId: page.id },
        target: { kind: "circle", id: circle.id },
        pinnedBy: { personId: null, name: page.updatedBy.name },
        pinnedAt: page.updatedAt,
        until: null,
        reason: null,
      });
    }
  }
  return { pins };
}

async function load(circles: Circle[]): Promise<Stored> {
  const stored = normalize(await readJson(KEY));
  if (stored) return stored;
  return enqueue(KEY, async () => {
    const again = normalize(await readJson(KEY));
    if (again) return again;
    const migrated = await migrate(circles);
    await writeJson(KEY, migrated);
    return migrated;
  });
}

/** Every pin, including ones past their date (for the map and clean-ups). */
export async function allPins(circles: Circle[]): Promise<Pin[]> {
  return (await load(circles)).pins;
}

/** The pins showing now on a target, or of a note, oldest first. */
export async function listPins(circles: Circle[], filter: { target?: PinTarget; note?: PinNoteRef; kind?: PinTarget["kind"] }): Promise<Pin[]> {
  const on = today();
  return (await allPins(circles)).filter(
    (pin) =>
      live(pin, on) &&
      (!filter.target || sameTarget(pin.target, filter.target)) &&
      (!filter.note || sameNote(pin.note, filter.note)) &&
      (!filter.kind || pin.target.kind === filter.kind)
  );
}

type Failure = "exists" | "full" | "not_found";
export type PinResult = { ok: true; pin: Pin } | { ok: false; reason: Failure };

async function mutate<T>(circles: Circle[], change: (pins: Pin[]) => { pins: Pin[]; result: T }): Promise<T> {
  await load(circles);
  return enqueue(KEY, async () => {
    const stored = normalize(await readJson(KEY)) ?? { pins: [] };
    const { pins, result } = change(stored.pins);
    if (pins !== stored.pins) await writeJson(KEY, { pins });
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
    if (others.filter((pin) => sameTarget(pin.target, input.target) && live(pin, on)).length >= MAX_PINS_PER_TARGET) {
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
    if (pins.length !== stored.pins.length) await writeJson(KEY, { pins });
    return stored.pins.length - pins.length;
  });
}

/** Take down the pins on something that's been deleted. */
export const removePinsOn = (target: PinTarget) => removePinsWhere((pin) => sameTarget(pin.target, target));

/** A deleted circle takes its pages' pins, and the pins on it and its tasks, with it. */
export const circleGone = (circleId: string) => (pin: Pin) =>
  pin.note.circleId === circleId || (pin.target.kind === "circle" && pin.target.id === circleId) || (pin.target.kind === "task" && pin.target.id.startsWith(`${circleId}:`));
