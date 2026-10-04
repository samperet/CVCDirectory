import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admins";
import { listUsers } from "@/lib/auth/users";
import { feedbackContext, feedbackProblem } from "@/lib/feedback/http";
import { FEEDBACK_KINDS } from "@/lib/feedback/shared";
import { addReport, feedbackInputSchema, listReports } from "@/lib/feedback/store";
import { readBody, throttled } from "@/lib/http";
import { notify } from "@/lib/push/notify";

export const dynamic = "force-dynamic";

/** Every bug report and feature request, newest first: admins only. */
export async function GET() {
  const ctx = await feedbackContext({ admin: true });
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    { reports: await listReports() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Send a bug report or feature request (from the ladybug), with the page it
 * was sent from and the browser. The admins get a push notification.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "feedback");
  if (limited) return limited;
  const ctx = await feedbackContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, feedbackInputSchema);
  if ("error" in parsed) return parsed.error;
  const browser = request.headers.get("user-agent")?.slice(0, 300) || null;
  const result = await addReport(ctx.actor, { ...parsed.data, browser });
  if (!result.ok) return feedbackProblem(result.reason);
  const { report } = result;
  const admins = (await listUsers()).filter((user) => isAdmin(user)).map((user) => user.id);
  // Admins hear about every report, whatever their settings — by push only.
  await notify({
    topic: "discussions",
    title: `${FEEDBACK_KINDS[report.kind]} from ${report.by.name}`,
    body: report.body,
    url: "/admin/feedback",
    tag: `feedback-${report.id}`,
    exceptUserId: ctx.actor.userId,
    onlyUserIds: admins,
    ignorePreferences: true,
  });
  return NextResponse.json({ report }, { status: 201 });
}
