import { NextRequest, NextResponse } from "next/server";
import { countsSchema, readEggLog, recordCounts } from "@/lib/schedules/egg-store";
import { eggContext, eggProblem } from "@/lib/schedules/http";
import { readerReady } from "@/lib/schedules/egg-reader";
import { eggsCsv, type EggLog, type EggLogResponse } from "@/lib/schedules/eggs";
import { problem, readBody, throttled } from "@/lib/http";
import { contentDisposition } from "@/lib/storage";
import { todayInVermont } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const answer = (log: EggLog, ctx: { label: string; canRecord: boolean }): EggLogResponse => ({
  ...log,
  label: ctx.label,
  canRecord: ctx.canRecord,
  readerReady: readerReady(),
});

/**
 * A circle's daily counts (its eggs) for anyone signed in: every day's count,
 * the photos of the calendar, what's counted, and whether you may record —
 * or, with `?format=csv`, every day as a CSV download (`date,count,recorded by`).
 */
export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await eggContext(params.id);
  if ("error" in ctx) return ctx.error;
  const log = await readEggLog(params.id);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const name = `${ctx.circle.name} ${ctx.label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    // The byte-order mark tells spreadsheets the file is UTF-8 (names with accents).
    return new NextResponse(`﻿${eggsCsv(log.days)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`${name.replace(/^-|-$/g, "")}.csv`, false),
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (request.nextUrl.searchParams.has("format")) return problem("The only format is csv");
  return NextResponse.json(answer(log, ctx), { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Record counts: `{ counts: { "2026-11-05": 12, "2026-11-06": null }, photoId? }`
 * — null clears a day; days to come are refused. `photoId` says they were
 * read from that photo of the calendar (and checked by whoever sends them).
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "eggs");
  if (limited) return limited;
  const ctx = await eggContext(params.id, { record: true });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, countsSchema);
  if ("error" in parsed) return parsed.error;
  const result = await recordCounts(params.id, parsed.data.counts, {
    by: { personId: ctx.actor.personId, name: ctx.actor.name },
    today: todayInVermont(),
    photoId: parsed.data.photoId,
  });
  if (!result.ok) return eggProblem(result.reason);
  return NextResponse.json(answer(result.log, ctx));
}
