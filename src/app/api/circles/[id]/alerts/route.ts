import { NextRequest, NextResponse } from "next/server";
import { addAlert, alertInputSchema, listAlerts } from "@/lib/alerts/store";
import { alertsContext, alertsProblem } from "@/lib/alerts/http";
import { audienceOf } from "@/lib/alerts/shared";
import { sendAlert } from "@/lib/alerts/send";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";
// An alert to everyone is an email to each resident.
export const maxDuration = 60;

type Params = { params: { id: string } };

/** A circle's recent alerts (newest first), whether you can send one, and how many each choice reaches. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await alertsContext(params.id);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    {
      alerts: (await listAlerts(params.id)).slice(0, 20),
      canSend: ctx.canSend,
      audience: {
        circle: audienceOf(ctx.directory, params.id, "circle").length,
        everyone: audienceOf(ctx.directory, params.id, "everyone").length,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Send an alert to the circle's members or to everyone: recorded first, then notified and emailed. */
export async function POST(request: NextRequest, { params }: Params) {
  // Per address, generous: neighbours may share one (CVC's Wi-Fi). Each person may send one a minute (the store).
  const limited = throttled(request, "alert");
  if (limited) return limited;
  const ctx = await alertsContext(params.id);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, alertInputSchema);
  if ("error" in parsed) return parsed.error;
  const to = audienceOf(ctx.directory, params.id, parsed.data.audience);
  const result = await addAlert(params.id, ctx.actor, parsed.data, to.length);
  if (!result.ok) return alertsProblem(result.reason);
  await sendAlert(ctx.circle, result.alert, to);
  return NextResponse.json({ alert: result.alert }, { status: 201 });
}
