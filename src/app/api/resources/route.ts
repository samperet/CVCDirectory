import { NextRequest, NextResponse } from "next/server";
import { addRecommendations, listRecommendations, recommendationInputSchema } from "@/lib/resources/store";
import { invalid, resourceActor } from "@/lib/resources/http";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ recommendations: await listRecommendations() }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Recommend someone; it's listed under your name. */
export async function POST(request: NextRequest) {
  if (!rateLimit(`resources:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const found = await resourceActor();
  if ("error" in found) return found.error;
  const parsed = recommendationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  const { actor } = found;
  const result = await addRecommendations([{ ...parsed.data, submittedBy: { personId: actor.personId, name: actor.name } }]);
  if (!result.ok) return problem("There's no room for more recommendations", 409, "Conflict");
  return NextResponse.json({ recommendation: result.value[0] }, { status: 201 });
}
