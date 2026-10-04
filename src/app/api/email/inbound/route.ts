import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/email/webhook";
import { handleInbound } from "@/lib/groups/inbound";
import { isDurable, isPersistent } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Resend's webhook (public, but it must carry a valid signature): an email
 * arrived at the community's domain (`email.received`). It's handled at once
 * — routed to its circle, posted or held, and sent on to the members (see
 * `lib/groups/inbound.ts`). If storage isn't working, it answers 503 so
 * Resend tries again later rather than the email being lost. Other events
 * are acknowledged and ignored.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const ok = verifyWebhook(
    process.env.RESEND_WEBHOOK_SECRET,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body
  );
  if (!ok) return new NextResponse("Invalid signature", { status: 401 });
  let event: { type?: string; data?: { email_id?: string; id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (event.type !== "email.received") return NextResponse.json({ ok: true, ignored: event.type });
  if (isPersistent() && !isDurable())
    return new NextResponse("Storage unavailable", { status: 503 });
  const emailId = event.data?.email_id ?? event.data?.id;
  if (!emailId) return new NextResponse("No email id", { status: 400 });
  const outcome = await handleInbound(emailId);
  // Not fetched yet, or a failure: ask Resend to try again.
  if (outcome === "not fetched" || outcome === "failed")
    return new NextResponse(outcome, { status: 503 });
  return NextResponse.json({ ok: true, outcome });
}
