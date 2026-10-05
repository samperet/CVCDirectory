import { NextResponse } from "next/server";
import { isDurable, isPersistent, readJson } from "@/lib/storage";
import { providerConfigured } from "@/lib/email/deliver";
import { PROVIDERS } from "@/lib/email/quota";

export const dynamic = "force-dynamic";

const R2_VARIABLES = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

/**
 * Storage health. Performs a real read first — durability only reflects a
 * failure once an R2 operation has been attempted — then reports booleans
 * only, never configuration values. Also whether each email sender's key is
 * set (BREVO_KEY, RESEND_KEY), as a boolean.
 */
export async function GET() {
  await readJson("health/probe.json");
  const configured = isPersistent();
  const durable = isDurable();
  if (!configured) {
    // Private runtime logs only: which expected variable names are present and
    // non-empty. Presence booleans for fixed names — nothing derived from values.
    const present = R2_VARIABLES.map(
      (name) => `${name}=${process.env[name]?.trim() ? "set" : "MISSING"}`
    );
    console.warn(`[health] R2 not configured: ${present.join(" ")}`);
  }
  const email = Object.fromEntries(
    PROVIDERS.map((provider) => [provider, providerConfigured(provider)])
  );
  // Temporary: the names (never values) of email-related variables this deployment sees.
  const emailNames = Object.keys(process.env)
    .filter((name) => /BREVO|RESEND|EMAIL|MAIL/i.test(name))
    .sort();
  return NextResponse.json(
    { storage: { configured, durable }, email, emailNames },
    { status: durable ? 200 : 503 }
  );
}
