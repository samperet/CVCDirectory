import { NextRequest, NextResponse } from "next/server";
import { feedbackContext, feedbackProblem } from "@/lib/feedback/http";
import { deleteReport, feedbackUpdateSchema, setReportDone } from "@/lib/feedback/store";
import { notFound, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Mark a report done (`done: true`) or open again: admins. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "feedback-admin");
  if (limited) return limited;
  const ctx = await feedbackContext({ admin: true });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, feedbackUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const result = await setReportDone(params.id, parsed.data.done, ctx.actor);
  return result.ok ? NextResponse.json({ report: result.report }) : feedbackProblem(result.reason);
}

/** Delete a report: admins. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "feedback-admin");
  if (limited) return limited;
  const ctx = await feedbackContext({ admin: true });
  if ("error" in ctx) return ctx.error;
  if (!(await deleteReport(params.id))) return notFound("Report");
  return NextResponse.json({ ok: true });
}
