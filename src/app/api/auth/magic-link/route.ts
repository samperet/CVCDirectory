import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { startVerification } from "@/lib/auth/users";
import { emailConfigured, sendMagicLinkEmail } from "@/lib/auth/email";
import { magicLinkSchema } from "@/lib/auth/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!rateLimit(`magic-link:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const user = await getSessionUser();
  if (!user) {
    return problem("Sign in by selecting your name first", 401, "Unauthorized");
  }
  if (user.verified) {
    return problem("This account is already verified", 409, "Conflict");
  }

  const parsed = magicLinkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const started = await startVerification(user.id, parsed.data.email);
  if (!started) {
    return problem("User not found", 404, "Not Found");
  }

  const origin = process.env.APP_URL ?? request.nextUrl.origin;
  const verifyUrl = `${origin}/api/auth/verify?token=${started.token}`;

  if (emailConfigured()) {
    await sendMagicLinkEmail(parsed.data.email, user.name, verifyUrl);
    return NextResponse.json({ sent: true });
  }

  // No email provider configured (preview mode): hand the link back so the
  // flow can still be completed. With RESEND_API_KEY set, the link is only
  // ever delivered to the email inbox.
  return NextResponse.json({ sent: false, previewUrl: verifyUrl });
}
