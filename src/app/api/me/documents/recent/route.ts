import { NextRequest } from "next/server";
import { recordView } from "@/lib/me/documents";
import { docRefSchema, json, writer } from "@/lib/me/http";
import { readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Note that you just opened a page, file or proposal, for your recent list.
 * (What it names isn't checked here: the list is read through `lookup`,
 * which leaves out anything that isn't there.)
 */
export async function POST(request: NextRequest) {
  const ctx = await writer(120);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, docRefSchema);
  if ("error" in parsed) return parsed.error;
  await recordView(ctx.user.id, parsed.data);
  return json({ ok: true });
}
