import { likeHandler } from "@/lib/forum/likes-route";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Like the opening post. */
export function PUT(_request: Request, { params }: Params) {
  return likeHandler(params.id, null, true);
}

/** Take back your like. */
export function DELETE(_request: Request, { params }: Params) {
  return likeHandler(params.id, null, false);
}
