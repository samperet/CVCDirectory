import { NextRequest, NextResponse } from "next/server";
import { excerpt, notify } from "@/lib/push/notify";
import { categorySlug } from "@/lib/resources/slug";
import { addRecommendations, listRecommendations, recommendationInputSchema } from "@/lib/resources/store";
import { resourceActor } from "@/lib/resources/http";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ recommendations: await listRecommendations() }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Recommend someone; it's listed under your name. */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "resources");
  if (limited) return limited;
  const found = await resourceActor();
  if ("error" in found) return found.error;
  const parsed = await readBody(request, recommendationInputSchema);
  if ("error" in parsed) return parsed.error;
  const { actor } = found;
  const result = await addRecommendations([{ ...parsed.data, submittedBy: { personId: actor.personId, name: actor.name } }]);
  if (!result.ok) return problem("There's no room for more recommendations", 409);
  const recommendation = result.value[0];
  await notify({
    topic: "resources",
    title: `${actor.name} recommends a ${recommendation.category.toLowerCase()}: ${recommendation.title}`,
    body: excerpt(recommendation.body),
    url: `/resources/${categorySlug(recommendation.category)}`,
    tag: `resource-${recommendation.id}`,
    exceptUserId: actor.userId,
  });
  return NextResponse.json({ recommendation }, { status: 201 });
}
