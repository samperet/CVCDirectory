import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { readDirectory } from "@/lib/directory/store";
import { problem, readBody, throttled } from "@/lib/http";
import { emailConfigured, fromAddress, sendTestEmail } from "@/lib/email/send";
import { providerConfigured } from "@/lib/email/deliver";
import {
  readEmailLog,
  readEmailSettings,
  settingsUpdateSchema,
  updateEmailSettings,
} from "@/lib/email/settings";
import { isEmailAddress, PROVIDER_NAMES } from "@/lib/email/shared";
import { quotaStatus } from "@/lib/email/quota";
import { readInboundLog } from "@/lib/groups/inbound";
import { pendingSummary } from "@/lib/groups/summary";

export const dynamic = "force-dynamic";

/**
 * The admin email settings: whether email can be sent (BREVO_KEY, RESEND_KEY), test
 * mode and the addresses allowed while it's on, how many residents have an
 * address, and the log of recent sendings. Admins only.
 */

async function admin() {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) };
  if (!isAdmin(user)) return { error: problem("Only admins can change email settings", 403) };
  return { user };
}

async function state() {
  const [settings, log, directory, quota, inbound, waiting] = await Promise.all([
    readEmailSettings(),
    readEmailLog(),
    readDirectory(),
    quotaStatus(providerConfigured),
    readInboundLog(),
    pendingSummary(),
  ]);
  const withAddress = new Set(
    (directory?.people ?? [])
      .map((person) => person.email?.trim().toLowerCase())
      .filter((email): email is string => !!email && isEmailAddress(email))
  ).size;
  return {
    settings,
    log,
    configured: emailConfigured(),
    from: fromAddress(),
    residentsWithEmail: withAddress,
    quota,
    inbound: inbound.slice(0, 50),
    waitingForSummary: waiting.length,
    receiving: !!process.env.RESEND_WEBHOOK_SECRET,
  };
}

export async function GET() {
  const ctx = await admin();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(await state(), { headers: { "Cache-Control": "private, no-store" } });
}

/** Turn test mode on or off, or change the allowed addresses. */
export async function PATCH(request: NextRequest) {
  const limited = throttled(request, "admin-email");
  if (limited) return limited;
  const ctx = await admin();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, settingsUpdateSchema);
  if ("error" in parsed) return parsed.error;
  await updateEmailSettings(ctx.user, parsed.data);
  return NextResponse.json(await state());
}

const testSchema = z.object({ to: z.string().trim().toLowerCase() });

/** Send a test email to one of the allowed addresses. */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "admin-email");
  if (limited) return limited;
  const ctx = await admin();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, testSchema);
  if ("error" in parsed) return parsed.error;
  if (!emailConfigured())
    return problem("Email isn't set up: BREVO_KEY and RESEND_KEY are missing", 503);
  const settings = await readEmailSettings();
  if (!settings.allowed.includes(parsed.data.to))
    return problem("Add that address to the allowed list first");
  const { worked, errors } = await sendTestEmail(parsed.data.to, ctx.user.name);
  const why = Object.entries(errors)
    .map(
      ([provider, error]) => `${PROVIDER_NAMES[provider as keyof typeof PROVIDER_NAMES]}: ${error}`
    )
    .join(" · ");
  if (!worked.length) return problem(`The email couldn't be sent${why ? ` — ${why}` : ""}`, 502);
  return NextResponse.json({
    ...(await state()),
    sentThrough: worked.map((provider) => PROVIDER_NAMES[provider]),
    ...(why ? { refused: why } : {}),
  });
}
