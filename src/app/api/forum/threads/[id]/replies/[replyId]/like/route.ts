import { likeHandler } from "@/lib/forum/likes-route";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; replyId: string } };

/** Like a reply. */
export function PUT(_request: Request, { params }: Params) {
  return likeHandler(params.id, params.replyId, true);
}

/** Take back your like. */
export function DELETE(_request: Request, { params }: Params) {
  return likeHandler(params.id, params.replyId, false);
}
