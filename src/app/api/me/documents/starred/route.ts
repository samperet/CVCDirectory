import { NextRequest } from "next/server";
import { z } from "zod";
import { setStarred } from "@/lib/me/documents";
import { docRefSchema, json, lookup, writer } from "@/lib/me/http";
import { MAX_STARRED } from "@/lib/me/shared";
import { full, notFound, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = docRefSchema.extend({ starred: z.boolean() });

/** Star a page, file or proposal (one that's there), or unstar it. */
export async function PUT(request: NextRequest) {
  const ctx = await writer(60);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const { kind, id, starred } = parsed.data;
  if (starred && !(await lookup())({ kind, id })) return notFound("Document");
  const result = await setStarred(ctx.user.id, { kind, id }, starred);
  if (!result.ok)
    return full(`You can star up to ${MAX_STARRED} documents — unstar one to make room`);
  return json({ starred });
}
