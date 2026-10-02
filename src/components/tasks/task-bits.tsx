"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Flag } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle } from "@/lib/circles/types";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  checklistProgress,
  isOverdue,
  type Task,
  type TaskStatus,
  type TaskSummary,
} from "@/lib/tasks/shared";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/text";
import { shortDate } from "@/lib/time";
import { useDirectory } from "@/components/directory/use-directory";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";

/** `canEdit`: change any task; `canAdd`: add one (any resident, where the circle's Tasks module allows). */
export type TasksResponse = {
  tasks: TaskSummary[];
  canEdit: boolean;
  canAdd: boolean;
  enabled: boolean;
};
/** `canEdit` here is for this task: the circle's editors, or whoever added it where any resident may. */
export type TaskResponse = { task: Task; canEdit: boolean; canAdd: boolean; enabled: boolean };

export const tasksQuery = (circleId: string) => ({
  queryKey: ["tasks", circleId],
  queryFn: () => apiFetch<TasksResponse>(`/api/circles/${circleId}/tasks`),
});

/** Change a task, then refresh the lists it shows up in. */
export function useTaskUpdate(circleId: string, number: number, onDone?: (task: Task) => void) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (update: Record<string, unknown>) =>
      apiFetch<{ task: Task }>(`/api/circles/${circleId}/tasks/${number}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      }),
    onSuccess: ({ task }) => {
      queryClient.setQueryData<TaskResponse>(["task", circleId, number], (old) =>
        old ? { ...old, task } : old
      );
      queryClient.invalidateQueries({ queryKey: ["tasks", circleId] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      onDone?.(task);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not change the task",
        description: error.message,
        variant: "destructive",
      }),
  });
}

/** Whether you can move a task along: the circle's editors, or its owner. */
export const canMoveTask = (
  task: Pick<Task, "ownerId">,
  canEdit: boolean,
  personId: string | null | undefined
) => canEdit || (!!personId && task.ownerId === personId);

export const STATUS_STYLES: Record<TaskStatus, { dot: string; pill: PillTone; column: string }> = {
  todo: { dot: "bg-moss", pill: "accent", column: "border-t-moss" },
  doing: { dot: "bg-sun", pill: "amber", column: "border-t-sun" },
  blocked: { dot: "bg-destructive", pill: "destructive", column: "border-t-destructive" },
  done: { dot: "bg-pine", pill: "pine", column: "border-t-pine" },
};

export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Pill tone={STATUS_STYLES[status].pill} className={cn("gap-1.5 font-semibold", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLES[status].dot)} aria-hidden />
      {STATUS_LABELS[status]}
    </Pill>
  );
}

export function StatusSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as TaskStatus)}
      onClick={(event) => event.stopPropagation()}
      className={cn("h-8 rounded-md px-2 text-xs font-medium", className)}
      aria-label="Status"
    >
      {TASK_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </Select>
  );
}

export function OwnerChip({ name, className }: { name: string | null; className?: string }) {
  if (!name) return <span className={cn("text-xs text-muted", className)}>Unassigned</span>;
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-foreground", className)}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/40 text-[0.65rem] font-bold text-primary-foreground"
        aria-hidden
      >
        {initials(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function DueLabel({
  task,
  className,
}: {
  task: Pick<Task, "dueDate" | "status">;
  className?: string;
}) {
  if (!task.dueDate) return null;
  const late = isOverdue(task);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        late ? "font-semibold text-destructive" : "text-muted",
        className
      )}
      title={late ? "Overdue" : "Due"}
    >
      <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {late ? "Overdue · " : ""}
      {shortDate(task.dueDate)}
    </span>
  );
}

export function PriorityFlag({ task }: { task: Pick<Task, "priority"> }) {
  if (task.priority !== "high") return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold text-destructive"
      title="High priority"
    >
      <Flag className="h-3.5 w-3.5 fill-current" aria-hidden /> High
    </span>
  );
}

export function ProgressBar({
  task,
  className,
}: {
  task: Pick<Task, "checklist">;
  className?: string;
}) {
  const progress = checklistProgress(task);
  if (!progress) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-xs text-muted", className)}
      title={`${progress.done} of ${progress.total} checklist items done`}
    >
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-accent">
        <span
          className="block h-full rounded-full bg-pine transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </span>
      {progress.done}/{progress.total}
    </span>
  );
}

/** Choose who a task is for: this circle's members first, then every other resident. */
export function OwnerSelect({
  circle,
  value,
  onChange,
  disabled,
  className,
}: {
  circle: Circle | undefined;
  value: string | null;
  onChange: (personId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const directory = useDirectory();
  const { members, others } = useMemo(() => {
    const people = [...(directory?.people ?? [])]
      .filter((person) => person.resident !== false)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const memberIds = new Set((circle?.seats ?? []).map((seat) => seat.personId));
    return {
      members: people.filter((person) => memberIds.has(person.id)),
      others: people.filter((person) => !memberIds.has(person.id)),
    };
  }, [directory, circle]);
  return (
    <Select
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      className={className}
      aria-label="Owner"
    >
      <option value="">Unassigned</option>
      {members.length ? (
        <optgroup label={circle ? `${circle.name} members` : "Members"}>
          {members.map((person) => (
            <option key={person.id} value={person.id}>
              {person.displayName}
            </option>
          ))}
        </optgroup>
      ) : null}
      <optgroup label={members.length ? "Everyone else" : "Residents"}>
        {others.map((person) => (
          <option key={person.id} value={person.id}>
            {person.displayName}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
