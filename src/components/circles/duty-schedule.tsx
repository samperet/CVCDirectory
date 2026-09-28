"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, Pencil, Phone } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Person } from "@/lib/directory/types";
import {
  Duty,
  DutySchedule,
  Household,
  MONTH_NAMES,
  WEEKDAYS,
  addDays,
  dutyFor,
  memberNames,
  monthGrid,
  todayIso,
  upcomingTurns,
} from "@/lib/schedules/rotation";
import { ScheduleEditor } from "@/components/circles/schedule-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface ScheduleResponse {
  schedule: DutySchedule | null;
  canEdit: boolean;
  canChangeDays: boolean;
}

/** Soft, distinct colors for households, in rotation order. */
const COLORS = [
  "bg-emerald-100 text-emerald-900 border-emerald-300",
  "bg-amber-100 text-amber-900 border-amber-300",
  "bg-sky-100 text-sky-900 border-sky-300",
  "bg-rose-100 text-rose-900 border-rose-300",
  "bg-violet-100 text-violet-900 border-violet-300",
  "bg-lime-100 text-lime-900 border-lime-300",
  "bg-orange-100 text-orange-900 border-orange-300",
  "bg-teal-100 text-teal-900 border-teal-300",
  "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300",
  "bg-cyan-100 text-cyan-900 border-cyan-300",
];
const NEEDS_COVER = "bg-red-50 text-red-700 border-red-300 border-dashed";

/** "Tue, Oct 6" for a calendar date, without time-zone drift. */
export function shortDay(date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** Whether the screen is at least `sm` wide (the month grid); the day editor goes beside whichever view is shown. */
function useWideScreen() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

const scheduleKey = (circleId: string) => ["circle-schedule", circleId];

/** A circle's schedule and what the viewer may change (shared with the circle page's buttons). */
export function useCircleSchedule(circleId: string) {
  return useQuery({
    queryKey: scheduleKey(circleId),
    queryFn: () => apiFetch<ScheduleResponse>(`/api/circles/${circleId}/schedule`),
  });
}

function HouseholdChip({ household, color, className }: { household?: Household; color: string; className?: string }) {
  return (
    <span className={cn("inline-block rounded-md border px-1.5 py-0.5 font-medium leading-tight", household ? color : NEEDS_COVER, className)}>
      {household?.name ?? "Needs cover"}
    </span>
  );
}

/** Change who's on duty for one day: a swap, cover while someone's away, or flag that it needs cover. */
function DayEditor({
  circleId,
  schedule,
  duty,
  onDone,
}: {
  circleId: string;
  schedule: DutySchedule;
  duty: Duty;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [householdId, setHouseholdId] = useState(duty.householdId ?? "");
  const [note, setNote] = useState(duty.override?.note ?? "");
  const regular = schedule.households.find((household) => household.id === duty.regularId);

  const save = useMutation({
    mutationFn: (body: { householdId: string | null; note: string } | null) =>
      apiFetch<ScheduleResponse>(`/api/circles/${circleId}/schedule/days/${duty.date}`, {
        method: body ? "PUT" : "DELETE",
        body: body ? JSON.stringify(body) : undefined,
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(scheduleKey(circleId), response);
      toast({ title: `Updated ${shortDay(duty.date)}` });
      onDone();
    },
    onError: (err: Error) => toast({ title: "Could not update the schedule", description: err.message, variant: "destructive" }),
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-accent/50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ householdId: householdId || null, note });
      }}
    >
      <div>
        <p className="font-semibold text-foreground">{shortDay(duty.date, { weekday: "long", month: "long", day: "numeric" })}</p>
        <p className="text-xs text-muted">
          Regular rotation: {regular ? `${regular.name} (${memberNames(regular)})` : "no one"}
          {duty.override?.updatedBy ? ` · changed by ${duty.override.updatedBy}` : ""}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={householdId}
          onChange={(event) => setHouseholdId(event.target.value)}
          className="h-10 rounded-lg border border-border bg-white px-3 text-sm sm:w-56"
          aria-label="On duty"
        >
          {schedule.households.map((household) => (
            <option key={household.id} value={household.id}>
              {household.name}
              {household.id === duty.regularId ? " (regular)" : ""}
            </option>
          ))}
          <option value="">Needs cover</option>
        </select>
        <Input
          placeholder={householdId === "" ? "Why? e.g. away Oct 3–10" : "Note, e.g. swapped with Fayre"}
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          className="bg-white"
          aria-label="Note"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {duty.override ? (
          <Button type="button" size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate(null)}>
            Back to regular
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * A circle's duty rotation as a month calendar that runs on indefinitely,
 * with today's and tomorrow's duty up top, the viewer's own next turns, a
 * legend of households (with members' phone numbers from the directory), and
 * the duty instructions for the current season.
 */
export function DutyScheduleModule({
  circleId,
  people,
  creating = false,
  onCreated,
}: {
  circleId: string;
  people: Map<string, Person>;
  /** Show the editor to set up a schedule this circle doesn't have yet. */
  creating?: boolean;
  onCreated?: () => void;
}) {
  const { user } = useSession();
  const today = todayIso();
  const [month, setMonth] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const wide = useWideScreen();

  const { data, isLoading, error } = useCircleSchedule(circleId);
  const schedule = data?.schedule ?? null;

  const colorOf = useMemo(
    () => new Map((schedule?.households ?? []).map((household, index) => [household.id, COLORS[index % COLORS.length]])),
    [schedule]
  );
  const householdOf = useMemo(() => new Map((schedule?.households ?? []).map((household) => [household.id, household])), [schedule]);
  const days = useMemo(() => monthGrid(month.year, month.month), [month]);

  if (isLoading) return null;
  if (error) {
    return (
      <Card>
        <p className="text-sm text-foreground">{(error as Error).message}</p>
      </Card>
    );
  }
  if (!data) return null;

  if (!schedule) {
    return creating && data.canEdit ? <ScheduleEditor circleId={circleId} schedule={null} people={people} onDone={() => onCreated?.()} /> : null;
  }
  if (editing && data.canEdit) {
    return <ScheduleEditor circleId={circleId} schedule={schedule} people={people} onDone={() => setEditing(false)} />;
  }

  const monthPrefix = `${month.year}-${String(month.month).padStart(2, "0")}`;
  const started = (date: string) => date >= schedule.startsOn;
  const step = (delta: number) =>
    setMonth(({ year, month: m }) => {
      const index = year * 12 + (m - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  const firstMonth = schedule.startsOn.slice(0, 7);
  const atFirstMonth = monthPrefix <= firstMonth;

  const mine = schedule.households.find((household) => household.members.some((member) => member.personId && member.personId === user?.personId));
  const myTurns = mine ? upcomingTurns(schedule, mine.id, today, 4) : [];
  const selectedDuty = selected ? dutyFor(schedule, selected) : null;

  const currentMonth = Number(today.slice(5, 7));
  const instructions = [...schedule.instructions].sort((a, b) => {
    const now = (item: typeof a) => (item.months?.length ? (item.months.includes(currentMonth) ? 0 : 2) : 1);
    return now(a) - now(b);
  });

  const summaryFor = (date: string, label: string) => {
    const duty = dutyFor(schedule, date);
    const household = duty.householdId ? householdOf.get(duty.householdId) : undefined;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        {started(date) ? (
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            <HouseholdChip household={household} color={colorOf.get(duty.householdId ?? "") ?? ""} />
            {household ? <span className="text-foreground-light">{memberNames(household)}</span> : null}
            {duty.override?.note ? <span className="text-xs text-muted">· {duty.override.note}</span> : null}
          </span>
        ) : (
          <span className="text-sm text-muted">Not started yet</span>
        )}
      </div>
    );
  };

  const cell = (date: string) => {
    const inMonth = date.startsWith(monthPrefix);
    const duty = dutyFor(schedule, date);
    const household = duty.householdId ? householdOf.get(duty.householdId) : undefined;
    const isToday = date === today;
    const clickable = data.canChangeDays && started(date) && inMonth;
    const Tag = clickable ? "button" : "div";
    return (
      <Tag
        key={date}
        {...(clickable ? { type: "button" as const, onClick: () => setSelected(selected === date ? null : date) } : {})}
        title={duty.override?.note ?? undefined}
        className={cn(
          "flex min-h-[4.5rem] flex-col items-stretch gap-1 border-b border-r border-border p-1.5 text-left text-[11px]",
          !inMonth && "bg-background/60 text-muted/60",
          inMonth && date < today && "opacity-60",
          clickable && "transition hover:bg-accent",
          selected === date && "bg-accent ring-2 ring-inset ring-ring"
        )}
        aria-label={clickable ? `Change ${shortDay(date)}` : undefined}
      >
        <span className="flex items-center justify-between">
          <span
            className={cn(
              "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs tabular-nums",
              isToday ? "bg-primary font-semibold text-primary-foreground" : "text-foreground-light"
            )}
          >
            {Number(date.slice(8))}
          </span>
          {duty.override && inMonth ? <ArrowLeftRight className="h-3 w-3 text-muted" aria-label="Changed from the regular rotation" /> : null}
        </span>
        {inMonth && started(date) ? <HouseholdChip household={household} color={colorOf.get(duty.householdId ?? "") ?? ""} /> : null}
      </Tag>
    );
  };

  const monthDays = days.filter((date) => date.startsWith(monthPrefix) && started(date));

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{schedule.title}</h2>
          <p className="text-sm text-muted">
            {data.canChangeDays ? "Tap a day to record a swap or cover." : "Households on the rotation can record swaps and cover."}
          </p>
        </div>
        {data.canEdit ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit rotation
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 rounded-lg border border-border bg-accent/40 p-4 sm:grid-cols-2">
        {summaryFor(today, `Today · ${shortDay(today)}`)}
        {summaryFor(addDays(today, 1), `Tomorrow · ${shortDay(addDays(today, 1))}`)}
        {mine ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Your next turns · {mine.name}</span>
            <span className="text-sm text-foreground">{myTurns.length ? myTurns.map((turn) => shortDay(turn.date)).join(" · ") : "None coming up"}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {MONTH_NAMES[month.month - 1]} {month.year}
          </h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => step(-1)} disabled={atFirstMonth} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonth({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}
            >
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => step(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Month grid on wider screens. */}
        <div className="hidden overflow-hidden rounded-lg border-l border-t border-border sm:block">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((day) => (
              <div key={day} className="border-b border-r border-border bg-accent/60 px-1.5 py-1 text-center text-xs font-semibold text-muted">
                {day.slice(0, 3)}
              </div>
            ))}
            {days.map(cell)}
          </div>
        </div>

        {/* A day-by-day list on phones. */}
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border sm:hidden">
          {monthDays.length ? (
            monthDays.map((date) => {
              const duty = dutyFor(schedule, date);
              const household = duty.householdId ? householdOf.get(duty.householdId) : undefined;
              const clickable = data.canChangeDays;
              return (
                <li key={date}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => setSelected(selected === date ? null : date)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                      date < today && "opacity-60",
                      date === today && "bg-accent",
                      selected === date && "ring-2 ring-inset ring-ring"
                    )}
                  >
                    <span className={cn("w-20 shrink-0 tabular-nums", date === today ? "font-semibold text-foreground" : "text-muted")}>
                      {shortDay(date, { weekday: "short", day: "numeric" })}
                    </span>
                    <HouseholdChip household={household} color={colorOf.get(duty.householdId ?? "") ?? ""} className="text-xs" />
                    {duty.override ? <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Changed" /> : null}
                    {duty.override?.note ? <span className="truncate text-xs text-muted">{duty.override.note}</span> : null}
                  </button>
                  {!wide && selected === date && selectedDuty ? (
                    <div className="p-3">
                      <DayEditor key={date} circleId={circleId} schedule={schedule} duty={selectedDuty} onDone={() => setSelected(null)} />
                    </div>
                  ) : null}
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-muted">The schedule starts {shortDay(schedule.startsOn)}.</li>
          )}
        </ul>

        {wide && selectedDuty ? (
          <DayEditor key={selectedDuty.date} circleId={circleId} schedule={schedule} duty={selectedDuty} onDone={() => setSelected(null)} />
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-foreground">Households</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {schedule.households.map((household) => {
            const turns = schedule.weekdays
              .map((ids, day) => (ids.includes(household.id) ? `${ids.length > 1 ? "Alternate " : ""}${WEEKDAYS[day]}s` : null))
              .filter(Boolean);
            return (
              <li key={household.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <HouseholdChip household={household} color={colorOf.get(household.id) ?? ""} className="text-xs" />
                  <span className="text-xs text-muted">{turns.length ? turns.join(", ") : "Not on the rotation"}</span>
                </div>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {household.members.map((member, index) => {
                    const person = member.personId ? people.get(member.personId) : undefined;
                    const phone = person?.phone ?? person?.landline;
                    return (
                      <li key={`${member.name}-${index}`} className="flex flex-wrap items-center gap-x-2 text-foreground-light">
                        {person?.displayName ?? member.name}
                        {phone ? (
                          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-xs text-muted hover:underline">
                            <Phone className="h-3 w-3" /> {phone}
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>

      {instructions.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-foreground">What duty involves</h3>
          {instructions.map((item, index) => {
            const current = !item.months?.length || item.months.includes(currentMonth);
            return (
              <details key={`${item.title}-${index}`} open={index === 0 || (current && !!item.months?.length)} className="group rounded-lg border border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground">
                  <span>
                    {item.title}
                    {item.months?.length && current ? <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">Now</span> : null}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" />
                </summary>
                <ul className="flex list-disc flex-col gap-1 px-4 pb-4 pl-9 text-sm text-foreground-light">
                  {item.body.split("\n").filter(Boolean).map((line, lineIndex) => (
                    <li key={lineIndex}>{line}</li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
