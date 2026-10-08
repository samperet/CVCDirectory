import { z } from "zod";
import { deleteJson, enqueue, mutateJson, readJson } from "@/lib/storage";
import { isCircleId } from "@/lib/circles/icons";
import {
  DEFAULT_DAILY_COUNT,
  DutyOverride,
  DutySchedule,
  dailyCountOf,
  isIsoDate,
} from "./rotation";

/**
 * A circle's duty rotation, one document per circle (`circles/schedules/<id>.json`).
 * Its daily count (what's counted, e.g. "Eggs") is kept here; the counts
 * themselves are in `egg-store.ts`.
 */

const householdId = z.string().regex(/^[a-z0-9-]{1,40}$/, "Invalid household id");
const isoDate = z.string().refine(isIsoDate, "Use a date like 2026-09-01");
const note = z.string().trim().max(200, "Keep notes to 200 characters").nullable().optional();

const householdSchema = z.object({
  id: householdId,
  name: z.string().trim().min(1, "Name each household").max(60),
  members: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        personId: z
          .string()
          .regex(/^[a-f0-9]{12}$/)
          .nullable()
          .optional(),
      })
    )
    .max(8),
});

const overrideSchema = z.object({ householdId: householdId.nullable(), note });

/** The rotation itself, as an editor sends it (one-off changes are kept separately). */
export const scheduleSetupSchema = z
  .object({
    title: z.string().trim().min(1, "Give the schedule a title").max(80),
    startsOn: isoDate,
    anchor: isoDate,
    households: z.array(householdSchema).min(1, "Add at least one household").max(30),
    weekdays: z.array(z.array(householdId).max(8)).length(7),
    instructions: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(60),
          body: z.string().trim().max(3000),
          months: z.array(z.number().int().min(1).max(12)).max(12).optional(),
        })
      )
      .max(6),
    // What's counted each day, printed on the calendar ("EGGS 2026-11"): words only; "" turns it off.
    dailyCount: z
      .string()
      .trim()
      .max(30, "Keep the daily count's name to 30 characters")
      .regex(/^[\p{L}\p{N} '’-]*$/u, "Name the daily count with letters and numbers only")
      .nullable()
      .optional(),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.households.map((household) => household.id));
    if (ids.size !== value.households.length)
      ctx.addIssue({ code: "custom", message: "Household ids must be unique" });
    for (const turn of value.weekdays) {
      if (turn.some((id) => !ids.has(id)))
        ctx.addIssue({ code: "custom", message: "A weekday names an unknown household" });
    }
  });

/** A complete schedule including one-off changes (for seeding through the admin API). */
export const scheduleDocumentSchema = z
  .object({ setup: scheduleSetupSchema, overrides: z.record(isoDate, overrideSchema).optional() })
  .superRefine((value, ctx) => {
    const ids = new Set(value.setup.households.map((household) => household.id));
    for (const override of Object.values(value.overrides ?? {})) {
      if (override.householdId && !ids.has(override.householdId))
        ctx.addIssue({ code: "custom", message: "A change names an unknown household" });
    }
  });

export const dayChangeSchema = overrideSchema;

const MAX_OVERRIDES = 1500;

function key(circleId: string) {
  if (!isCircleId(circleId)) throw new Error("Invalid circle id");
  return `circles/schedules/${circleId}.json`;
}

/** A stored schedule as the app uses it; an older one without a daily count counts eggs. */
function normalize(raw: unknown): DutySchedule | null {
  const doc = raw as DutySchedule | null;
  return doc?.households
    ? {
        ...doc,
        overrides: doc.overrides ?? {},
        instructions: doc.instructions ?? [],
        dailyCount: dailyCountOf(doc) ?? "",
      }
    : null;
}

export async function readSchedule(circleId: string): Promise<DutySchedule | null> {
  if (!isCircleId(circleId)) return null;
  return normalize(await readJson(key(circleId)));
}

/** Keep only changes that still name a household in the rotation, newest dates first when trimming. */
function pruneOverrides(overrides: Record<string, DutyOverride>, households: { id: string }[]) {
  const ids = new Set(households.map((household) => household.id));
  const kept = Object.entries(overrides)
    .filter(([, override]) => override.householdId === null || ids.has(override.householdId))
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, MAX_OVERRIDES);
  return Object.fromEntries(kept);
}

/**
 * Save the rotation, keeping existing one-off changes unless new ones are
 * given — and the daily count's name unless a new one is.
 */
export async function saveSchedule(
  circleId: string,
  setup: z.infer<typeof scheduleSetupSchema>,
  overrides?: Record<string, DutyOverride>
): Promise<DutySchedule> {
  return mutateJson<DutySchedule>(key(circleId), (raw) => {
    const existing = normalize(raw);
    const schedule: DutySchedule = {
      ...setup,
      dailyCount:
        setup.dailyCount === undefined
          ? existing?.dailyCount ?? DEFAULT_DAILY_COUNT
          : setup.dailyCount ?? "",
      overrides: pruneOverrides(overrides ?? existing?.overrides ?? {}, setup.households),
      updatedAt: new Date().toISOString(),
    };
    return { value: schedule, result: schedule };
  });
}

/** Record who's on duty for one date (or put it back to the regular rotation with null). */
export async function setDayChange(
  circleId: string,
  date: string,
  change: { householdId: string | null; note?: string | null } | null,
  by: string
): Promise<DutySchedule | "not_found" | "unknown_household"> {
  return mutateJson<DutySchedule | "not_found" | "unknown_household">(key(circleId), (raw) => {
    const schedule = normalize(raw);
    if (!schedule) return { write: false, result: "not_found" };
    if (
      change?.householdId &&
      !schedule.households.some((household) => household.id === change.householdId)
    ) {
      return { write: false, result: "unknown_household" };
    }
    const overrides = { ...schedule.overrides };
    if (change)
      overrides[date] = {
        householdId: change.householdId,
        note: change.note || null,
        updatedBy: by,
        updatedAt: new Date().toISOString(),
      };
    else delete overrides[date];
    const next = { ...schedule, overrides: pruneOverrides(overrides, schedule.households) };
    return { value: next, result: next };
  });
}

export async function deleteSchedule(circleId: string) {
  await enqueue(key(circleId), () => deleteJson(key(circleId)));
}
