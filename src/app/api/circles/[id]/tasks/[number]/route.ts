import { NextRequest, NextResponse } from "next/server";
import {
  deleteTask,
  getTask,
  taskUpdateSchema,
  updateTask,
  type TaskUpdate,
} from "@/lib/tasks/store";
import { deleteCommentsForTask } from "@/lib/tasks/comments";
import { parseNumber, personName, taskProblem, tasksContext } from "@/lib/tasks/http";
import type { Task } from "@/lib/tasks/shared";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; number: string } };

/** A task, with its log. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await tasksContext(params.id);
  if ("error" in ctx) return ctx.error;
  const number = parseNumber(params.number);
  const task = number ? await getTask(params.id, number) : null;
  if (!task) return taskProblem("not_found");
  return NextResponse.json(
    { task, canEdit: ctx.ownTask(task), canAdd: ctx.canAdd, enabled: ctx.enabled },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Change a task. The circle's editors change anything (so can whoever added
 * it, where any resident may add tasks). The task's owner can move it along
 * (status, checklist ticks) or hand it back; anyone can take on a task
 * nobody has.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await tasksContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  const number = parseNumber(params.number);
  if (!number) return taskProblem("not_found");
  const parsed = await readBody(request, taskUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const ownerName = personName(ctx.directory, parsed.data.ownerId ?? null);
  if (parsed.data.ownerId && !ownerName) return problem("That person isn't in the directory");

  const me = ctx.user.personId ?? null;
  const allowed = (task: Task, update: TaskUpdate) => {
    if (ctx.ownTask(task)) return true;
    const fields = Object.keys(update);
    const isOwner = !!me && task.ownerId === me;
    const claiming = fields.length === 1 && update.ownerId === me && !!me && !task.ownerId;
    const movingAlong =
      isOwner &&
      fields.every(
        (field) =>
          field === "status" ||
          field === "toggle" ||
          (field === "ownerId" && update.ownerId === null)
      );
    return claiming || movingAlong;
  };
  const result = await updateTask(
    params.id,
    number,
    { name: ctx.user.name },
    parsed.data,
    ownerName,
    allowed
  );
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

/** Delete a task: the circle's editors, or whoever added it where any resident may add tasks. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await tasksContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  const number = parseNumber(params.number);
  if (!number) return taskProblem("not_found");
  const existing = await getTask(params.id, number);
  if (!existing) return taskProblem("not_found");
  if (!ctx.ownTask(existing)) return taskProblem("forbidden");
  const result = await deleteTask(params.id, number);
  if (!result.ok) return taskProblem(result.reason);
  if (result.before) await deleteCommentsForTask(params.id, result.before.id);
  return NextResponse.json({ ok: true });
}
