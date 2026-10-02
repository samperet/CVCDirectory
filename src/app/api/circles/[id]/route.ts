import { NextRequest, NextResponse } from "next/server";
import { moveCircleDocuments } from "@/lib/documents/store";
import { handOverPages } from "@/lib/wiki/store";
import { deleteCircleTasks } from "@/lib/tasks/store";
import { deleteCircleTaskComments } from "@/lib/tasks/comments";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { circleUpdateSchema, deleteCircle, updateCircle } from "@/lib/circles/store";
import { canManageCircle } from "@/lib/circles/icons";
import { isAdmin } from "@/lib/auth/admins";
import { iconKey, setCircleIcon } from "@/lib/circles/icons";
import { deleteBinary, deleteJson } from "@/lib/storage";
import { problem, readBody } from "@/lib/http";
import { BOARD_ID, COMMUNITY_ID } from "@/lib/circles/ids";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Edit a circle's name, description, sections, or who can
 * join (its members or the Board), or whether it's an official circle or a
 * social club (the Board).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;

  const parsed = await readBody(request, circleUpdateSchema);
  if ("error" in parsed) return parsed.error;

  if (parsed.data.kind !== undefined) {
    if (params.id === BOARD_ID || params.id === "community")
      return problem("The Board and Community circles can't become social clubs");
    if (!isAdmin(ctx.user) && !canManageCircle(ctx.directory, BOARD_ID, ctx.personId)) {
      return problem("Only the Board can change whether this is a circle or a social club", 403);
    }
  }

  const result = await updateCircle(ctx.imported, params.id, parsed.data);
  return result.ok ? NextResponse.json({ circle: result.value }) : circleProblem(result.reason);
}

/** Delete a circle (the Board only); the Board itself can't be deleted. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id, require: "board" });
  if ("error" in ctx) return ctx.error;
  if (params.id === BOARD_ID) return problem("The Board can't be deleted", 409);
  if (params.id === COMMUNITY_ID) return problem("The Community circle can't be deleted", 409);

  const result = await deleteCircle(ctx.imported, params.id);
  if (!result.ok) return circleProblem(result.reason);
  await deleteBinary(iconKey(params.id));
  await setCircleIcon(params.id, null);
  // Its documents are community records: they become the Board's rather than vanishing.
  await moveCircleDocuments(params.id, BOARD_ID);
  // Its wiki pages are community records too: the Board keeps them (photos, comments, and polls stay with them).
  await handOverPages(params.id, BOARD_ID);
  await deleteCircleTasks(params.id);
  await deleteCircleTaskComments(params.id);
  // What's left of its old meetings and proposals (no longer shown) goes with it.
  await deleteJson(`meetings/${params.id}.json`);
  return NextResponse.json({ ok: true });
}
