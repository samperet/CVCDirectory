import { todayInVermont } from "@/lib/time";
import type { Actor } from "@/lib/auth/actor";
import type { CommentRecord } from "@/lib/comments/shared";

/**
 * Circle tasks, as shared by the server and the browser (no server imports).
 */

export const TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

/** Who added a task (stored with it). */
export type TaskPerson = Pick<Actor, "userId" | "personId" | "name">;

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Something that happened to a task: "moved this to In progress". */
export interface TaskEvent {
  at: string;
  by: string;
  text: string;
}

export interface Task {
  id: string;
  /** Numbered per circle (#1, #2, …): the task's address. */
  number: number;
  title: string;
  /** Markdown, shown like a wiki page (so `[[Page]]` links work). */
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Who's doing it: a person in the directory. */
  ownerId: string | null;
  ownerName: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  checklist: ChecklistItem[];
  createdAt: string;
  createdBy: TaskPerson;
  updatedAt: string;
  completedAt: string | null;
  /** Newest last; the most recent 50. */
  activity: TaskEvent[];
}

/** A task as listed: with how many comments it has. */
export type TaskSummary = Omit<Task, "activity" | "description"> & {
  commentCount: number;
  hasDescription: boolean;
};

/** A comment on a task (replies nest to any depth); see `lib/comments/shared.ts`. */
export type TaskComment = CommentRecord & { taskId: string };

/** How far along a task's checklist is, or null with no checklist. */
export function checklistProgress(task: Pick<Task, "checklist">) {
  if (!task.checklist.length) return null;
  const done = task.checklist.filter((item) => item.done).length;
  return {
    done,
    total: task.checklist.length,
    percent: Math.round((done / task.checklist.length) * 100),
  };
}

export const isOverdue = (task: Pick<Task, "dueDate" | "status">, today = todayInVermont()) =>
  !!task.dueDate && task.status !== "done" && task.dueDate < today;
