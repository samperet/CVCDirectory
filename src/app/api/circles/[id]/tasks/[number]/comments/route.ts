import { NextRequest, NextResponse } from "next/server";
import { getTask } from "@/lib/tasks/store";
import { addTaskComment, ancestors, listTaskComments, taskCommentInputSchema } from "@/lib/tasks/comments";
import { parseNumber, taskProblem, tasksContext } from "@/lib/tasks/http";
import { userIdsForPeople } from "@/lib/auth/users";
import { excerpt, notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; number: string } };

async function load(params: Params["params"], write = false) {
  const ctx = await tasksContext(params.id, { write });
  if ("error" in ctx) return { error: ctx.error };
  const number = parseNumber(params.number);
  const task = number ? await getTask(params.id, number) : null;
  if (!task) return { error: taskProblem("not_found") };
  return { ...ctx, task };
}

/** A task's comments, oldest first (replies nest by `parentId`). */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ comments: await listTaskComments(params.id, ctx.task.id), canModerate: ctx.canModerate }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Comment on a task, or reply to a comment (`parentId`): any resident. */
export async function POST(request: NextRequest, { params }: Params) {
  if (!rateLimit(`task-comment:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await load(params, true);
  if ("error" in ctx) return ctx.error;
  const parsed = taskCommentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await addTaskComment(params.id, ctx.task.id, { id: ctx.user.id, name: ctx.user.name }, parsed.data);
  if (!result.ok) return result.reason === "unknown_parent" ? problem("That comment no longer exists", 404, "Not Found") : problem("This circle's tasks have too many comments", 409, "Conflict");

  // Tell the task's owner and whoever added it, and those in the conversation above this reply.
  const above = ancestors(result.comments, result.comment!).map((entry) => entry.authorId);
  const recipients = Array.from(new Set([ctx.task.createdBy.userId, ...(await userIdsForPeople([ctx.task.ownerId])), ...above]));
  await notify({
    topic: "tasks",
    title: `${ctx.user.name} commented on “${ctx.task.title}”`,
    body: excerpt(parsed.data.body),
    url: `/circles/${params.id}/tasks/${ctx.task.number}#comments`,
    tag: `task-comments-${ctx.task.id}`,
    exceptUserId: ctx.user.id,
    onlyUserIds: recipients,
  });
  return NextResponse.json({ comment: result.comment }, { status: 201 });
}
