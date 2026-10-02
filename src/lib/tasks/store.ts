import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, readJson, writeJson } from "@/lib/storage";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPerson,
} from "./shared";

/**
 * Circle tasks: each circle's in one document (`tasks/<circleId>.json`),
 * numbered in the order they're added. A task keeps a short log of what's
 * happened to it (who moved it along, who took it on).
 */

const MAX_TASKS = 1000;
const MAX_ACTIVITY = 50;
const MAX_CHECKLIST = 50;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15");
const title = z
  .string()
  .trim()
  .min(1, "Give the task a title")
  .max(160, "Keep the title to 160 characters");
const description = z.string().max(10_000, "Keep the description to 10,000 characters");
const checklistItem = z.object({
  id: z.string().max(40).optional(),
  text: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});

export const taskInputSchema = z.object({
  title,
  description: description.default(""),
  status: z.enum(TASK_STATUSES).default("todo"),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  ownerId: z.string().max(80).nullable().default(null),
  dueDate: isoDate.nullable().default(null),
  checklist: z.array(checklistItem).max(MAX_CHECKLIST).default([]),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskUpdateSchema = z
  .object({
    title,
    description,
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    ownerId: z.string().max(80).nullable(),
    dueDate: isoDate.nullable(),
    checklist: z.array(checklistItem).max(MAX_CHECKLIST),
    /** Tick (or untick) one checklist item. */
    toggle: z.object({ id: z.string().max(40), done: z.boolean() }),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

const key = (circleId: string) => `tasks/${circleId}.json`;
type Stored = { nextNumber: number; tasks: Task[] };

function normalize(raw: unknown): Stored {
  const value = raw as Partial<Stored> | null;
  const tasks = Array.isArray(value?.tasks) ? (value!.tasks as Task[]) : [];
  return {
    tasks,
    nextNumber: value?.nextNumber ?? tasks.reduce((max, task) => Math.max(max, task.number), 0) + 1,
  };
}

export async function listTasks(circleId: string): Promise<Task[]> {
  return normalize(await readJson(key(circleId))).tasks;
}

export async function getTask(circleId: string, number: number): Promise<Task | null> {
  return (await listTasks(circleId)).find((task) => task.number === number) ?? null;
}

type Failure = "not_found" | "full" | "forbidden";
export type TaskResult =
  | { ok: true; task: Task | null; before: Task | null }
  | { ok: false; reason: Failure };

async function mutate(
  circleId: string,
  change: (stored: Stored) => { stored: Stored; task: Task | null; before: Task | null } | Failure
): Promise<TaskResult> {
  return enqueue<TaskResult>(key(circleId), async () => {
    const result = change(normalize(await readJson(key(circleId))));
    if (typeof result === "string") return { ok: false, reason: result };
    await writeJson(key(circleId), result.stored);
    return { ok: true, task: result.task, before: result.before };
  });
}

const log = (task: Task, by: string, text: string): Task => ({
  ...task,
  activity: [...task.activity, { at: new Date().toISOString(), by, text }].slice(-MAX_ACTIVITY),
});
const withIds = (items: { id?: string; text: string; done: boolean }[]) =>
  items.map((item) => ({
    id: item.id || randomUUID().slice(0, 8),
    text: item.text,
    done: item.done,
  }));

export function createTask(
  circleId: string,
  author: TaskPerson,
  input: TaskInput,
  ownerName: string | null
) {
  return mutate(circleId, (stored) => {
    if (stored.tasks.length >= MAX_TASKS) return "full";
    const now = new Date().toISOString();
    let task: Task = {
      id: randomUUID(),
      number: stored.nextNumber,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      ownerId: input.ownerId,
      ownerName: input.ownerId ? ownerName : null,
      dueDate: input.dueDate,
      checklist: withIds(input.checklist),
      createdAt: now,
      createdBy: author,
      updatedAt: now,
      completedAt: input.status === "done" ? now : null,
      activity: [],
    };
    task = log(
      task,
      author.name,
      ownerName && input.ownerId ? `added this task, for ${ownerName}` : "added this task"
    );
    return {
      stored: { nextNumber: stored.nextNumber + 1, tasks: [...stored.tasks, task] },
      task,
      before: null,
    };
  });
}

/**
 * Change a task. `canEdit`: the circle's editors change anything; others
 * (the task's owner, say) only what `allowed` lets them.
 */
export function updateTask(
  circleId: string,
  number: number,
  actor: { name: string },
  update: TaskUpdate,
  ownerName: string | null,
  allowed: (task: Task, update: TaskUpdate) => boolean
) {
  return mutate(circleId, (stored) => {
    const before = stored.tasks.find((task) => task.number === number);
    if (!before) return "not_found";
    if (!allowed(before, update)) return "forbidden";
    let task: Task = { ...before };
    const say = (text: string) => (task = log(task, actor.name, text));

    if (update.title !== undefined && update.title !== task.title) {
      task.title = update.title;
      say("renamed this task");
    }
    if (update.description !== undefined && update.description !== task.description) {
      task.description = update.description;
      say("edited the description");
    }
    if (update.status && update.status !== task.status) {
      task.status = update.status;
      task.completedAt = update.status === "done" ? new Date().toISOString() : null;
      say(`moved this to ${STATUS_LABELS[update.status]}`);
    }
    if (update.priority && update.priority !== task.priority) {
      task.priority = update.priority;
      say(`set the priority to ${PRIORITY_LABELS[update.priority]}`);
    }
    if (update.ownerId !== undefined && update.ownerId !== task.ownerId) {
      task.ownerId = update.ownerId;
      task.ownerName = update.ownerId ? ownerName : null;
      say(
        update.ownerId
          ? ownerName === actor.name
            ? "took this on"
            : `gave this to ${ownerName}`
          : "left this unassigned"
      );
    }
    if (update.dueDate !== undefined && update.dueDate !== task.dueDate) {
      task.dueDate = update.dueDate;
      say(update.dueDate ? `set it due ${update.dueDate}` : "removed the due date");
    }
    if (update.checklist) {
      const next = withIds(update.checklist);
      const had = new Set(task.checklist.map((item) => item.id));
      const has = new Set(next.map((item) => item.id));
      const added = next.filter((item) => !had.has(item.id));
      const removed = task.checklist.filter((item) => !has.has(item.id));
      task.checklist = next;
      if (added.length === 1 && !removed.length) say(`added “${added[0].text}” to the checklist`);
      else if (removed.length === 1 && !added.length)
        say(`removed “${removed[0].text}” from the checklist`);
      else say("updated the checklist");
    }
    if (update.toggle) {
      const item = task.checklist.find((entry) => entry.id === update.toggle!.id);
      if (!item) return "not_found";
      if (item.done !== update.toggle.done) {
        task.checklist = task.checklist.map((entry) =>
          entry.id === item.id ? { ...entry, done: update.toggle!.done } : entry
        );
        say(`${update.toggle.done ? "checked off" : "unchecked"} “${item.text}”`);
      }
    }
    if (task.activity === before.activity) return { stored, task: before, before };
    task.updatedAt = new Date().toISOString();
    return {
      stored: {
        ...stored,
        tasks: stored.tasks.map((entry) => (entry.id === task.id ? task : entry)),
      },
      task,
      before,
    };
  });
}

export function deleteTask(circleId: string, number: number) {
  return mutate(circleId, (stored) => {
    const task = stored.tasks.find((entry) => entry.number === number);
    if (!task) return "not_found";
    return {
      stored: { ...stored, tasks: stored.tasks.filter((entry) => entry.id !== task.id) },
      task: null,
      before: task,
    };
  });
}

/** Remove a circle's tasks (when the circle is deleted). */
export function deleteCircleTasks(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}
