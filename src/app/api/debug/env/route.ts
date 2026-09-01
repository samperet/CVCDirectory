import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic: reports WHICH storage-related environment variable
 * names are present, never their values. Used to confirm the R2 credentials
 * are wired under the names the store expects. Safe to delete once storage
 * is confirmed working.
 */
export async function GET() {
  const expected = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ];

  const present = Object.fromEntries(
    expected.map((key) => [key, Boolean(process.env[key])])
  );

  // Any other env var whose NAME hints at R2/Cloudflare/bucket storage, so a
  // different naming convention can be spotted. Names only — no values.
  const related = Object.keys(process.env)
    .filter((key) => /r2|cloudflare|bucket|s3/i.test(key))
    .sort();

  return NextResponse.json({
    expected: present,
    allExpectedPresent: expected.every((key) => Boolean(process.env[key])),
    relatedEnvNames: related,
  });
}
