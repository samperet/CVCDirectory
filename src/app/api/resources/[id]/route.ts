import { NextRequest } from "next/server";
import {
  recommendationUpdateSchema,
  removeRecommendation,
  updateRecommendation,
} from "@/lib/resources/store";
import { resourceActor, resourceResponse } from "@/lib/resources/http";
import { readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Edit a recommendation: whoever made it, or an admin. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const found = await resourceActor();
  if ("error" in found) return found.error;
  const parsed = await readBody(request, recommendationUpdateSchema);
  if ("error" in parsed) return parsed.error;
  return resourceResponse(await updateRecommendation(params.id, found.actor, parsed.data));
}

/** Remove a recommendation: whoever made it, or an admin. */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await resourceActor();
  if ("error" in found) return found.error;
  return resourceResponse(await removeRecommendation(params.id, found.actor));
}
