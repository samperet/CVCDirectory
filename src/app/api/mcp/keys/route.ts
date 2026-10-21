import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { listKeys, makeKey, MAX_KEYS } from "@/lib/mcp/store";
import { full, problem, readBody, throttled } from "@/lib/http";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const schema = z.object({
  label: z.string().trim().max(60).default(""),
  scope: z.enum(["read", "write"]).default("read"),
});

/** Your keys for AI assistants (GET), and a new one (POST: its secret, shown this once; `scope` read or write). */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to continue", 401);
  return NextResponse.json(
    { keys: await listKeys(user.personId), url: `${siteUrl()}/api/mcp` },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const limited = throttled(request, "mcp-keys", "Too many new keys — wait a minute", 10);
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to continue", 401);
  const parsed = await readBody(request, schema, {});
  if ("error" in parsed) return parsed.error;
  const made = await makeKey(user.personId, parsed.data.label, parsed.data.scope);
  if (made === "full") return full(`You can have ${MAX_KEYS} keys — take one away first`);
  return NextResponse.json(
    { key: made.key, secret: made.token, url: `${siteUrl()}/api/mcp` },
    { status: 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
