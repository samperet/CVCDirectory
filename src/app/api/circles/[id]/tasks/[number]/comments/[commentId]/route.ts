import { NextRequest, NextResponse } from "next/server";
import { getTask } from "@/lib/tasks/store";
import { deleteTaskComment, editTaskComment, taskCommentUpdateSchema } from "@/lib/tasks/comments";
import { parseNumber, taskProblem, tasksContext } from "@/lib/tasks/http";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; number: string; commentId: string } };

async function load(params: Params["params"]) {
  const ctx = await tasksContext(params.id, { write: true });
  if ("error" in ctx) return { error: ctx.error };
  const number = parseNumber(params.number);
  const task = number ? await getTask(params.id, number) : null;
  if (!task) return { error: taskProblem("not_found") };
  return { ...ctx, task };
}

const failure = (reason: string) =>
  reason === "forbidden"
    ? problem("Only the comment's author can do that", 403)
    : problem("That comment no longer exists", 404);

/** Edit your comment. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, taskCommentUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const result = await editTaskComment(
    params.id,
    ctx.task.id,
    params.commentId,
    { id: ctx.user.id },
    parsed.data.body
  );
  return result.ok ? NextResponse.json({ comment: result.comment }) : failure(result.reason);
}

/** Delete a comment: its author, the circle's editors, or an admin. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  const result = await deleteTaskComment(params.id, ctx.task.id, params.commentId, {
    id: ctx.user.id,
    canModerate: ctx.canModerate,
  });
  return result.ok ? NextResponse.json({ ok: true }) : failure(result.reason);
}
