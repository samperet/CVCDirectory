import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { addEggPhoto, eggPhotoKey } from "@/lib/schedules/egg-store";
import { readEggPhoto, readerReady } from "@/lib/schedules/egg-reader";
import { eggContext, readerProblem } from "@/lib/schedules/http";
import { isMonth, monthOf } from "@/lib/schedules/print";
import type { EggReading } from "@/lib/schedules/eggs";
import { readImageUpload } from "@/lib/images";
import { problem, throttled } from "@/lib/http";
import { writeBinary } from "@/lib/storage";
import { todayInVermont } from "@/lib/time";

export const dynamic = "force-dynamic";
// Reading a photo often takes ten seconds to a minute.
export const maxDuration = 120;

type Params = { params: { id: string } };

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * Read the counts written on a photo of the printed calendar: the photo is
 * the raw request body (a JPEG — the page resizes it to 2576 px on its long
 * side first), `?month=YYYY-MM` the month it's probably for. The photo is
 * kept (with an entry in the egg log's `photos`), then read
 * (`lib/schedules/egg-reader.ts`), and what was read comes back to be checked
 * — nothing is recorded here. For those who may record counts.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "eggs-read", "Too many photos at once — wait a minute", 10);
  if (limited) return limited;
  const ctx = await eggContext(params.id, { record: true });
  if ("error" in ctx) return ctx.error;
  if (!readerReady()) return readerProblem("not_configured");

  const upload = await readImageUpload(request, { maxBytes: MAX_PHOTO_BYTES, label: "Photo" });
  if ("error" in upload) return upload.error;
  if (upload.file.contentType !== "image/jpeg") return problem("Send the photo as a JPEG", 415);

  const today = todayInVermont();
  const hint = request.nextUrl.searchParams.get("month");
  const month = isMonth(hint) ? hint : monthOf(today);
  const photoId = randomUUID();
  await writeBinary(eggPhotoKey(params.id, photoId), upload.file);
  const result = await readEggPhoto(upload.file, { label: ctx.label, month, today });
  // The photo is on record whether or not it could be read.
  await addEggPhoto(params.id, {
    id: photoId,
    month: result.ok ? result.reading.month : null,
    at: new Date().toISOString(),
    by: { personId: ctx.actor.personId, name: ctx.actor.name },
  });
  if (!result.ok) return readerProblem(result.reason);
  const reading: EggReading = { photoId, ...result.reading };
  return NextResponse.json(reading);
}
