import { NextRequest, NextResponse } from "next/server";
import { feedOwner, listBackups } from "@/lib/backups/store";
import { problem, throttled } from "@/lib/http";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * A resident's backup feed, for an agent or a script (no sign-in: the token
 * in its address is the key, made on the backups page): the backups kept,
 * newest first, each with its fingerprint and links to its zip and proof.
 */
export async function GET(request: NextRequest) {
  const limited = throttled(request, "backups-feed-read", "Too many requests — wait a minute", 20);
  if (limited) return limited;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const owner = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await feedOwner(token) : null;
  if (!owner) return problem("That feed isn't there — make a new one on the backups page", 404);
  const base = `${siteUrl()}/api/backups/feed/file?token=${token}`;
  const backups = (await listBackups()).map((backup) => ({
    ...backup,
    zip: `${base}&id=${backup.id}&file=zip`,
    proof: backup.timestamped ? `${base}&id=${backup.id}&file=ots` : null,
  }));
  return NextResponse.json(
    {
      about:
        "Backups of Common Pastures (CVC), newest first. Each zip holds manifest.json (what's in it, with each file's SHA-256), data/ (every stored JSON document and file), pages/ (Markdown) and README.md. sha256 is the whole zip's; proof is its OpenTimestamps proof (verify with `ots verify`).",
      backups,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
