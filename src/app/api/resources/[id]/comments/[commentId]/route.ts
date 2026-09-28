import { NextRequest } from "next/server";
import { commentSchema, editComment, removeComment } from "@/lib/resources/store";
import { invalid, resourceActor, resourceResponse } from "@/lib/resources/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; commentId: string } };

/** Edit your comment (admins can edit any). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const found = await resourceActor();
  if ("error" in found) return found.error;
  const parsed = commentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  return resourceResponse(await editComment(params.id, params.commentId, found.actor, parsed.data.body));
}

/** Delete your comment (admins can delete any). */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await resourceActor();
  if ("error" in found) return found.error;
  return resourceResponse(await removeComment(params.id, params.commentId, found.actor));
}
