import { NextRequest, NextResponse } from "next/server";
import { NO_EMAIL, updateEmailPreferences } from "@/lib/email/preferences";
import {
  readUnsubscribeToken,
  scopeCircle,
  unsubscribeToken,
  type UnsubscribeScope,
} from "@/lib/email/unsubscribe";
import { escapeHtml } from "@/lib/email/deliver";
import { readDirectory } from "@/lib/directory/store";
import { setDelivery, webOnlyEverywhere } from "@/lib/groups/delivery";
import { throttled } from "@/lib/http";
import { TOPICS, type Topic } from "@/lib/push/topics";

export const dynamic = "force-dynamic";

/**
 * An email's "Stop them" link (no sign-in: the signed token says who and
 * what). Opening it changes nothing — it asks, with a button — because mail
 * scanners open every link in an email; pressing the button (a POST), or a
 * mail app's one-click unsubscribe (also a POST), makes the change. A
 * notification topic is turned off; a circle's email switches that circle to
 * the web only (they stay in the circle); "all" does both for everything.
 */

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(
      title
    )}</title></head>
<body style="margin:0;background:#f6fef9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#1e4620">
<main style="max-width:480px;margin:64px auto;padding:0 16px;line-height:1.55">
<h1 style="font-family:Georgia,serif;font-size:26px">${escapeHtml(title)}</h1>
${body}
<p style="color:#6b8e70;font-size:14px;margin-top:28px">You can choose which emails you get from your profile in Common Pastures.</p>
</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );

const button = (label: string) =>
  `<button type="submit" name="confirm" value="1" style="font:600 16px/1 inherit;padding:13px 22px;border-radius:999px;border:0;background:#315a39;color:#fff;cursor:pointer">${escapeHtml(
    label
  )}</button>`;

async function describe(scope: UnsubscribeScope) {
  const circleId = scopeCircle(scope);
  if (circleId) {
    const name =
      (await readDirectory())?.circles.find((circle) => circle.id === circleId)?.name ??
      "this circle";
    return {
      ask: `Get ${name}'s messages on the web only?`,
      explain: `You'll stay in ${escapeHtml(
        name
      )} and can read and write its messages in Common Pastures — they just won't be emailed to you.`,
      action: "Yes, web only",
      done: `${name}'s messages won't be emailed to you`,
    };
  }
  if (scope === "all")
    return {
      ask: "Stop all emails from Common Pastures?",
      explain: "No notifications and no circle messages by email. Everything stays in the app.",
      action: "Stop all emails",
      done: "You won't get any more emails",
    };
  return {
    ask: "Stop these emails?",
    explain: `You won't be emailed about ${escapeHtml(
      TOPICS[scope as Topic].toLowerCase()
    )} any more.`,
    action: "Stop these emails",
    done: "Done — no more of these emails",
  };
}

async function apply(personId: string, scope: UnsubscribeScope) {
  const circleId = scopeCircle(scope);
  if (circleId) return setDelivery(personId, circleId, "web");
  await updateEmailPreferences(personId, scope === "all" ? NO_EMAIL : { [scope]: false });
  if (scope === "all")
    await webOnlyEverywhere(
      personId,
      ((await readDirectory())?.circles ?? []).map((circle) => circle.id)
    );
}

const invalid = () =>
  page(
    "That link doesn't work",
    "<p>It may have been copied incompletely, or it has been changed.</p>",
    400
  );

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const found = readUnsubscribeToken(token);
  if (!found) return throttled(request, "unsubscribe") ?? invalid();
  const words = await describe(found.scope);
  return page(
    words.ask,
    `<p>${words.explain}</p>
<form method="post" action="/api/email/unsubscribe?t=${encodeURIComponent(token)}">${button(
      words.action
    )}</form>`
  );
}

/** The confirm button, or a mail app's one-click unsubscribe (`List-Unsubscribe-Post`). */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const found = readUnsubscribeToken(token);
  if (!found) return throttled(request, "unsubscribe") ?? invalid();
  await apply(found.personId, found.scope);
  const form = await request.formData().catch(() => null);
  // A mail app's one-click: a plain answer is enough.
  if (form?.get("List-Unsubscribe") === "One-Click" || !form?.get("confirm"))
    return new NextResponse("Unsubscribed", { status: 200 });
  const words = await describe(found.scope);
  const all =
    found.scope === "all"
      ? ""
      : `<form method="post" action="/api/email/unsubscribe?t=${encodeURIComponent(
          unsubscribeToken(found.personId, "all")
        )}"><p>Or ${button("Stop all emails from Common Pastures")}</p></form>`;
  return page(words.done, all);
}
