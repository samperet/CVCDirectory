import { NextRequest, NextResponse } from "next/server";
import { removePinsOn } from "@/lib/pins/store";
import { deleteTask, getTask, taskUpdateSchema, updateTask, type TaskUpdate } from "@/lib/tasks/store";
import { deleteCommentsForTask } from "@/lib/tasks/comments";
import { parseNumber, personName, taskProblem, tasksContext } from "@/lib/tasks/http";
import type { Task } from "@/lib/tasks/shared";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; number: string } };

/** A task, with its log. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await tasksContext(params.id);
  if ("error" in ctx) return ctx.error;
  const number = parseNumber(params.number);
  const task = number ? await getTask(params.id, number) : null;
  if (!task) return taskProblem("not_found");
  return NextResponse.json({ task, canEdit: ctx.canEdit, enabled: ctx.enabled }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Change a task. The circle's editors change anything. The task's owner can
 * move it along (status, checklist ticks) or hand it back; anyone can take on
 * a task nobody has.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await tasksContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  const number = parseNumber(params.number);
  if (!number) return taskProblem("not_found");
  const parsed = taskUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const ownerName = personName(ctx.directory, parsed.data.ownerId ?? null);
  if (parsed.data.ownerId && !ownerName) return problem("That person isn't in the directory");

  const me = ctx.user.personId ?? null;
  const allowed = (task: Task, update: TaskUpdate) => {
    if (ctx.canEdit) return true;
    const fields = Object.keys(update);
    const isOwner = !!me && task.ownerId === me;
    const claiming = fields.length === 1 && update.ownerId === me && !!me && !task.ownerId;
    const movingAlong = isOwner && fields.every((field) => field === "status" || field === "toggle" || (field === "ownerId" && update.ownerId === null));
    return claiming || movingAlong;
  };
  const result = await updateTask(params.id, number, { name: ctx.user.name }, parsed.data, ownerName, allowed);
  if (!result.ok) return taskProblem(result.reason);
  const task = result.task!;
  const before = result.before!;
  const url = `/circles/${params.id}/tasks/${task.number}`;

  // A new owner hears about it; so does whoever added a task when it's done.
  if (task.ownerId && task.ownerId !== before.ownerId && task.ownerId !== me) {
    await notify({
      topic: "tasks",
      title: `${ctx.user.name} gave you a task in ${ctx.circle.name}`,
      body: task.title,
      url,
      tag: `task-${task.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: await userIdsForPeople([task.ownerId]),
    });
  }
  if (task.status === "done" && before.status !== "done") {
    await notify({
      topic: "tasks",
      title: `${ctx.user.name} finished a task in ${ctx.circle.name}`,
      body: task.title,
      url,
      tag: `task-${task.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: [task.createdBy.userId],
    });
  }
  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await tasksContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  if (!ctx.canEdit) return taskProblem("forbidden");
  const number = parseNumber(params.number);
  if (!number) return taskProblem("not_found");
  const result = await deleteTask(params.id, number);
  if (!result.ok) return taskProblem(result.reason);
  if (result.before) await deleteCommentsForTask(params.id, result.before.id);
  await removePinsOn({ kind: "task", id: `${params.id}:${number}` });
  return NextResponse.json({ ok: true });
}
