import { NextRequest, NextResponse } from "next/server";
import { NO_EMAIL, updateEmailPreferences } from "@/lib/email/preferences";
import { readUnsubscribeToken, unsubscribeToken } from "@/lib/email/unsubscribe";
import { throttled } from "@/lib/http";
import { TOPICS } from "@/lib/push/topics";

export const dynamic = "force-dynamic";

/**
 * An email's "Stop them" link (no sign-in: the signed token says who and
 * what). Opening it turns that topic off and says so, with a link to stop
 * every email; mail apps' one-click unsubscribe POSTs the same address.
 */

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f3f8f2;font-family:Georgia,serif;color:#1f2b22">
<main style="max-width:480px;margin:64px auto;padding:0 16px">
<h1 style="font-size:24px">${title}</h1>
${body}
</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );

async function unsubscribe(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const found = readUnsubscribeToken(token);
  if (!found) return null;
  await updateEmailPreferences(
    found.personId,
    found.scope === "all" ? NO_EMAIL : { [found.scope]: false }
  );
  return found;
}

export async function GET(request: NextRequest) {
  const limited = throttled(request, "unsubscribe");
  if (limited) return limited;
  const found = await unsubscribe(request);
  if (!found)
    return page(
      "That link doesn't work",
      "<p>It may have been copied incompletely. You can choose which emails you get from your profile in Common Pastures.</p>",
      400
    );
  if (found.scope === "all")
    return page(
      "You won't get any more emails",
      "<p>Common Pastures won't email you any more. You can turn emails back on from your profile.</p>"
    );
  const all = `/api/email/unsubscribe?t=${encodeURIComponent(
    unsubscribeToken(found.personId, "all")
  )}`;
  return page(
    "Done — no more of these emails",
    `<p>You won't be emailed about ${TOPICS[found.scope].toLowerCase()} any more.</p>
<p><a href="${all}" style="color:#315a39">Stop all emails from Common Pastures</a></p>
<p style="color:#5b6b5f;font-size:14px">You can choose which emails you get from your profile in Common Pastures.</p>`
  );
}

/** One-click unsubscribe from a mail app (`List-Unsubscribe-Post`). */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "unsubscribe");
  if (limited) return limited;
  const found = await unsubscribe(request);
  return new NextResponse(found ? "Unsubscribed" : "Invalid link", { status: found ? 200 : 400 });
}
