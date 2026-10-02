import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { anyoneAddsTasks, featureEnabled } from "@/lib/circles/features";
import { canUploadTo } from "@/lib/documents/access";
import { isAdmin } from "@/lib/auth/admins";
import { problem } from "@/lib/http";
import type { DirectoryDocument } from "@/lib/directory/types";

/**
 * Who may see and change a circle's tasks. Every signed-in resident sees
 * them and can comment. The circle's editors — those who can add its
 * documents: its members, the Board, and admins (anyone, for the Community
 * circle) — add, change, and delete any task. A circle whose Tasks module
 * lets any resident add tasks also lets each resident change and delete
 * the tasks they added (`ownTask`). A task's owner can move it along (status
 * and checklist), and anyone can take on a task nobody has yet.
 */
export async function tasksContext(circleId: string, { write = false } = {}) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const enabled = featureEnabled(circle, "tasks");
  if (write && !enabled) return { error: problem(`${circle.name} has turned its tasks off`, 409, "Conflict") };
  const canEdit = enabled && canUploadTo(ctx.user, ctx.directory, circleId);
  const canAdd = canEdit || (enabled && anyoneAddsTasks(circle));
  const ownTask = (task: { createdBy: { userId: string } }) => canEdit || (canAdd && task.createdBy.userId === ctx.user.id);
  return { user: ctx.user, directory: ctx.directory, circle, enabled, canEdit, canAdd, ownTask, canModerate: canEdit || isAdmin(ctx.user) };
}

/** A person's name from the directory, if they're in it. */
export const personName = (directory: DirectoryDocument, personId: string | null) =>
  personId ? directory.people.find((person) => person.id === personId)?.displayName ?? null : null;

export const parseNumber = (value: string) => (/^\d{1,6}$/.test(value) ? Number(value) : null);

export function taskProblem(reason: "not_found" | "full" | "forbidden") {
  switch (reason) {
    case "not_found":
      return problem("That task no longer exists", 404, "Not Found");
    case "full":
      return problem("This circle has as many tasks as it can hold", 409, "Conflict");
    case "forbidden":
      return problem("Only this circle's members, the Board, and admins can change that", 403, "Forbidden");
  }
}
