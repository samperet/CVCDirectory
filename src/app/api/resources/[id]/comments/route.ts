import { NextRequest } from "next/server";
import { addComment, commentSchema } from "@/lib/resources/store";
import { invalid, resourceActor, resourceResponse } from "@/lib/resources/http";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(`resource-comments:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const found = await resourceActor();
  if ("error" in found) return found.error;
  const parsed = commentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  return resourceResponse(await addComment(params.id, found.actor, parsed.data.body), 201);
}
