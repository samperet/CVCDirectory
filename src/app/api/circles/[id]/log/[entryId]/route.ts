import { NextRequest, NextResponse } from "next/server";
import { deleteLogEntry, editLogEntry, logUpdateSchema } from "@/lib/log/store";
import { logContext, logProblem } from "@/lib/log/http";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; entryId: string } };

/** Edit your own update or reply. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "log");
  if (limited) return limited;
  const ctx = await logContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, logUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const result = await editLogEntry(
    params.id,
    params.entryId,
    { ...ctx.actor, canModerate: false },
    parsed.data.body
  );
  return result.ok ? NextResponse.json({ entry: result.entry }) : logProblem(result.reason);
}

/** Delete your own update or reply (the circle's members, the Board, and admins: any). */
export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "log");
  if (limited) return limited;
  const ctx = await logContext(params.id);
  if ("error" in ctx) return ctx.error;
  const result = await deleteLogEntry(params.id, params.entryId, {
    ...ctx.actor,
    canModerate: ctx.canModerate,
  });
  return result.ok ? NextResponse.json({ ok: true }) : logProblem(result.reason);
}
