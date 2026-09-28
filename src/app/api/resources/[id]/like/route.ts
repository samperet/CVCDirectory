import { setLike } from "@/lib/resources/store";
import { resourceActor, resourceResponse } from "@/lib/resources/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function like(id: string, liked: boolean) {
  const found = await resourceActor();
  if ("error" in found) return found.error;
  return resourceResponse(await setLike(id, found.actor, liked));
}

export function PUT(_request: Request, { params }: Params) {
  return like(params.id, true);
}

export function DELETE(_request: Request, { params }: Params) {
  return like(params.id, false);
}
