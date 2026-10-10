import { NextRequest, NextResponse } from "next/server";
import { moveCircleDocuments } from "@/lib/documents/store";
import { handOverPages } from "@/lib/wiki/store";
import { handOverProposals } from "@/lib/proposals/store";
import { deleteCircleTasks } from "@/lib/tasks/store";
import { deleteCircleTaskComments } from "@/lib/tasks/comments";
import { deleteCircleLog } from "@/lib/log/store";
import { deleteCircleGroups } from "@/lib/groups/store";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { circleUpdateSchema, deleteCircle, updateCircle } from "@/lib/circles/store";
import { canManageCircle } from "@/lib/circles/icons";
import { canHaveSubgroups, parentOf } from "@/lib/circles/tiers";
import { isAdmin } from "@/lib/auth/admins";
import { iconKey, setCircleIcon } from "@/lib/circles/icons";
import { deleteBinary, deleteJson } from "@/lib/storage";
import { possessive } from "@/lib/text";
import { problem, readBody } from "@/lib/http";
import { BOARD_ID, COMMUNITY_ID } from "@/lib/circles/ids";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Edit a circle's name, description, sections, or who can join (its members
 * or the Board — and, for a sub group, its parent's members), or whether it's
 * an official circle or a social club (the Board; never a sub group, which
 * is of its parent's kind).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;

  const parsed = await readBody(request, circleUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const circle = ctx.directory.circles.find((entry) => entry.id === params.id)!;
  if (
    parsed.data.modules?.some((module) => module.type === "subgroups") &&
    !canHaveSubgroups(ctx.directory.circles, circle)
  )
    return problem("Only a circle (not a sub group, or Community) can have sub groups");
  if (parsed.data.kind !== undefined) {
    if (params.id === BOARD_ID || params.id === "community")
      return problem("The Board and Community circles can't become social clubs");
    if (parentOf(ctx.directory.circles, circle))
      return problem("A sub group is the same kind as the circle it's in");
    if (!isAdmin(ctx.user) && !canManageCircle(ctx.directory, BOARD_ID, ctx.personId)) {
      return problem("Only the Board can change whether this is a circle or a social club", 403);
    }
  }

  const result = await updateCircle(ctx.imported, params.id, parsed.data);
  return result.ok ? NextResponse.json({ circle: result.value }) : circleProblem(result.reason);
}

/**
 * Delete a circle (the Board) or a sub group (also its parent's members);
 * the Board and Community can't be deleted. A deleted circle's sub groups
 * become circles of their own.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id });
  if ("error" in ctx) return ctx.error;
  if (params.id === BOARD_ID) return problem("The Board can't be deleted", 409);
  if (params.id === COMMUNITY_ID) return problem("The Community circle can't be deleted", 409);
  const circle = ctx.directory.circles.find((entry) => entry.id === params.id)!;
  const parent = parentOf(ctx.directory.circles, circle);
  if (!isAdmin(ctx.user) && !canManageCircle(ctx.directory, parent?.id ?? BOARD_ID, ctx.personId))
    return problem(
      parent
        ? `Only ${possessive(parent.name)} members (or the Board) can delete it`
        : "Only the Board can delete a circle",
      403
    );
  // What a sub group leaves goes to its circle; a circle's, to the Board.
  const heir = parent?.id ?? BOARD_ID;

  const result = await deleteCircle(ctx.imported, params.id);
  if (!result.ok) return circleProblem(result.reason);
  await deleteBinary(iconKey(params.id));
  await setCircleIcon(params.id, null);
  // Its documents are community records: they're kept rather than vanishing.
  await moveCircleDocuments(params.id, heir);
  // Its wiki pages are community records too (photos, comments, and polls stay with them),
  // and its proposals not yet consented (consented ones stay as they were decided).
  await handOverPages(params.id, heir);
  await handOverProposals(params.id, heir);
  await deleteCircleTasks(params.id);
  await deleteCircleTaskComments(params.id);
  // What's left of its old meetings and proposals (no longer shown) goes with it.
  await deleteJson(`meetings/${params.id}.json`);
  await deleteCircleLog(params.id);
  await deleteCircleGroups(params.id);
  // Its finances (expenses, budgets, receipts) are kept, as money records: a circle started again
  // under the same name finds them on its Finances module.
  return NextResponse.json({ ok: true });
}
