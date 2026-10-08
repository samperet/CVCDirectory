import { z } from "zod";
import { deleteBinary, mutateJson, readJson } from "@/lib/storage";
import { isCircleId } from "@/lib/circles/icons";
import { isIsoDate } from "./rotation";
import {
  MAX_COUNT,
  addPhoto,
  mergeCounts,
  normalizeEggLog,
  type CountFailure,
  type EggLog,
  type EggPhoto,
  type EggRecorder,
} from "./eggs";

/**
 * A circle's daily counts (the Chicken Tenders' eggs), one document per
 * circle: `circles/eggs/<circleId>.json`, holding each day's count and the
 * photos of the printed calendar sent to be read, whose images are kept
 * beside it (`circles/eggs/<circleId>/photos/<id>.jpg`). The rules — whole
 * numbers from 0 to 500, nothing for days to come, the newest 4000 days and
 * 100 photos — are in `eggs.ts`; who may record is `scheduleAccess`.
 */

const key = (circleId: string) => {
  if (!isCircleId(circleId)) throw new Error("Invalid circle id");
  return `circles/eggs/${circleId}.json`;
};

/** Where a photo of the calendar is kept. */
export const eggPhotoKey = (circleId: string, photoId: string) => {
  if (!isCircleId(circleId) || !z.string().uuid().safeParse(photoId).success)
    throw new Error("Invalid photo");
  return `circles/eggs/${circleId}/photos/${photoId}.jpg`;
};

const count = z
  .number({ invalid_type_error: "Counts are whole numbers from 0 to 500" })
  .int("Counts are whole numbers from 0 to 500")
  .min(0, "Counts are whole numbers from 0 to 500")
  .max(MAX_COUNT, "Counts are whole numbers from 0 to 500");

/** Counts to record, by date (null clears a day), and the photo they were read from. */
export const countsSchema = z.object({
  counts: z
    .record(z.string().refine(isIsoDate, "Use dates like 2026-11-05"), count.nullable())
    .refine((counts) => Object.keys(counts).length > 0, "There are no counts to save")
    .refine((counts) => Object.keys(counts).length <= 400, "Save at most 400 days at a time"),
  photoId: z.string().uuid().nullable().optional(),
});

export async function readEggLog(circleId: string): Promise<EggLog> {
  if (!isCircleId(circleId)) return normalizeEggLog(null);
  return normalizeEggLog(await readJson(key(circleId)));
}

export type Failure = CountFailure;
export type CountsResult = { ok: true; log: EggLog } | { ok: false; reason: Failure };

/** Record counts (null clears a day) as `by`, from a photo when `photoId` is given. */
export function recordCounts(
  circleId: string,
  counts: Record<string, number | null>,
  change: { by: EggRecorder; today: string; photoId?: string | null }
): Promise<CountsResult> {
  const at = new Date().toISOString();
  return mutateJson<CountsResult>(key(circleId), (raw) => {
    const log = normalizeEggLog(raw);
    const merged = mergeCounts(log, counts, { ...change, at });
    if (typeof merged === "string") return { write: false, result: { ok: false, reason: merged } };
    if (!merged.changed.length) return { write: false, result: { ok: true, log } };
    return { value: merged.log, result: { ok: true, log: merged.log } };
  });
}

/**
 * Note a photo of the calendar (its image already stored at `eggPhotoKey`).
 * The oldest photos beyond the last 100 are forgotten and their images removed.
 */
export async function addEggPhoto(circleId: string, photo: EggPhoto) {
  const dropped = await mutateJson(key(circleId), (raw) => {
    const result = addPhoto(normalizeEggLog(raw), photo);
    return { value: result.log, result: result.dropped };
  });
  await Promise.all(dropped.map((id) => deleteBinary(eggPhotoKey(circleId, id)).catch(() => {})));
}
