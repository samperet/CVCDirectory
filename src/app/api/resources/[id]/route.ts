import { NextRequest } from "next/server";
import { recommendationUpdateSchema, removeRecommendation, updateRecommendation } from "@/lib/resources/store";
import { invalid, resourceActor, resourceResponse } from "@/lib/resources/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Edit a recommendation: whoever made it, or an admin. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const found = await resourceActor();
  if ("error" in found) return found.error;
  const parsed = recommendationUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  return resourceResponse(await updateRecommendation(params.id, found.actor, parsed.data));
}

/** Remove a recommendation: whoever made it, or an admin. */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await resourceActor();
  if ("error" in found) return found.error;
  return resourceResponse(await removeRecommendation(params.id, found.actor));
}
