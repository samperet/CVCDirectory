import { NextRequest, NextResponse } from "next/server";
import { moveCircleDocuments } from "@/lib/documents/store";
import { handOverPages } from "@/lib/wiki/store";
import { deleteCircleTasks } from "@/lib/tasks/store";
import { deleteCircleTaskComments } from "@/lib/tasks/comments";
import { deleteCircleLog } from "@/lib/log/store";
import { addAlias, deleteCircleGroups, readAliases } from "@/lib/groups/store";
import { addressTaken, emailNameProblem, groupLocal } from "@/lib/groups/shared";
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
 * Edit a circle's name, description, group email address, sections, or who
 * can join (its members or the Board), or whether it's an official circle or
 * a social club (the Board). A circle whose address changes (chosen, or by a
 * rename) keeps answering to the old one; an address another circle answers
 * to, or one kept for the mail system, can't be chosen.
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

  const emailName = parsed.data.emailName;
  if (emailName) {
    if (params.id === COMMUNITY_ID) return problem("The Community circle has no address", 409);
    const why = emailNameProblem(emailName);
    if (why) return problem(why);
    if (addressTaken(emailName, params.id, ctx.directory.circles, await readAliases()))
      return problem("Another circle already uses that address — choose another", 409);
  }

  const before = ctx.directory.circles.find((circle) => circle.id === params.id);
  const result = await updateCircle(ctx.imported, params.id, parsed.data);
  // A circle whose address changed keeps answering to its old one.
  if (result.ok && before && groupLocal(before) !== groupLocal(result.value))
    await addAlias(groupLocal(before), params.id);
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
  await deleteCircleLog(params.id);
  await deleteCircleGroups(params.id);
  return NextResponse.json({ ok: true });
}
