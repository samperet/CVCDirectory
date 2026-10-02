"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Person } from "@/lib/directory/types";
import {
  DutyInstructions,
  DutySchedule,
  Household,
  MONTH_NAMES,
  WEEKDAYS,
  addDays,
  regularDuty,
  todayIso,
  weekdayOf,
} from "@/lib/schedules/rotation";
import type { ScheduleResponse } from "@/components/circles/duty-schedule";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

type Setup = Omit<DutySchedule, "overrides" | "updatedAt">;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "household";

function blankSetup(): Setup {
  const today = todayIso();
  return {
    title: "Duty schedule",
    startsOn: today,
    anchor: today,
    households: [],
    weekdays: [[], [], [], [], [], [], []],
    instructions: [],
  };
}

/** One household: its name and members, each linked to their directory entry when the name matches one. */
function HouseholdRow({
  household,
  people,
  onChange,
  onRemove,
}: {
  household: Household;
  people: Person[];
  onChange: (household: Household) => void;
  onRemove: () => void;
}) {
  const [member, setMember] = useState("");
  const add = () => {
    const name = member.trim();
    if (!name) return;
    const person = people.find((entry) => entry.displayName.toLowerCase() === name.toLowerCase());
    onChange({
      ...household,
      members: [
        ...household.members,
        { name: person?.displayName ?? name, personId: person?.id ?? null },
      ],
    });
    setMember("");
  };
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex gap-2">
        <Input
          value={household.name}
          maxLength={60}
          onChange={(event) => onChange({ ...household, name: event.target.value })}
          className="bg-white font-medium"
          aria-label="Household name"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove ${household.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {household.members.map((entry, index) => (
          <span
            key={`${entry.name}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs text-secondary-foreground"
          >
            {entry.name}
            {!entry.personId ? (
              <span className="text-secondary-foreground/60">(not in directory)</span>
            ) : null}
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-white/60"
              onClick={() =>
                onChange({ ...household, members: household.members.filter((_, i) => i !== index) })
              }
              aria-label={`Remove ${entry.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          list="schedule-people"
          placeholder="Add a member"
          value={member}
          maxLength={60}
          onChange={(event) => setMember(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className="bg-white"
          aria-label={`Add a member to ${household.name}`}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={!member.trim() || household.members.length >= 8}
        >
          Add
        </Button>
      </div>
    </li>
  );
}

function MonthToggles({
  months,
  onChange,
}: {
  months: number[];
  onChange: (months: number[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted">Applies in</span>
      {MONTH_NAMES.map((name, index) => {
        const month = index + 1;
        const on = months.includes(month);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            title={name}
            onClick={() =>
              onChange(
                on ? months.filter((m) => m !== month) : [...months, month].sort((a, b) => a - b)
              )
            }
            className={cn(
              "h-7 w-8 rounded-md border text-xs",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-white text-muted"
            )}
          >
            {name.slice(0, 3)}
          </button>
        );
      })}
      <span className="ml-1 text-xs text-muted">{months.length ? "" : "(year-round)"}</span>
    </div>
  );
}

/**
 * Set up or change a circle's rotation: households and their members, who
 * takes each weekday (several households alternate week by week), and the
 * duty instructions. One-off swaps and cover are kept.
 */
export function ScheduleEditor({
  circleId,
  schedule,
  people,
  onDone,
}: {
  circleId: string;
  schedule: DutySchedule | null;
  people: Map<string, Person>;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Setup>(() => {
    if (!schedule) return blankSetup();
    const { overrides: _overrides, updatedAt: _updatedAt, ...setup } = schedule;
    return structuredClone(setup);
  });
  const directory = useMemo(
    () => Array.from(people.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [people]
  );
  const today = todayIso();

  const update = (change: Partial<Setup>) => setDraft((current) => ({ ...current, ...change }));
  const setHousehold = (index: number, household: Household) =>
    update({ households: draft.households.map((entry, i) => (i === index ? household : entry)) });
  const removeHousehold = (index: number) => {
    const id = draft.households[index].id;
    update({
      households: draft.households.filter((_, i) => i !== index),
      weekdays: draft.weekdays.map((turn) => turn.filter((entry) => entry !== id)),
    });
  };
  const addHousehold = () => {
    const taken = new Set(draft.households.map((household) => household.id));
    let id = `household-${draft.households.length + 1}`;
    for (let n = 2; taken.has(id); n++) id = `household-${draft.households.length + n}`;
    update({ households: [...draft.households, { id, name: "", members: [] }] });
  };
  const setTurn = (day: number, turn: string[]) =>
    update({ weekdays: draft.weekdays.map((entry, i) => (i === day ? turn : entry)) });
  const setInstructions = (index: number, item: DutyInstructions) =>
    update({ instructions: draft.instructions.map((entry, i) => (i === index ? item : entry)) });

  const save = useMutation({
    mutationFn: () => {
      // New households get an id from their name, kept from then on.
      const ids = new Set<string>();
      const households = draft.households.map((household) => {
        let id = household.id.startsWith("household-") ? slug(household.name) : household.id;
        for (let n = 2; ids.has(id); n++) id = `${slug(household.name)}-${n}`;
        ids.add(id);
        return { ...household, id, name: household.name.trim() };
      });
      const rename = new Map(
        draft.households.map((household, index) => [household.id, households[index].id])
      );
      const body: Setup = {
        ...draft,
        households,
        weekdays: draft.weekdays.map((turn) => turn.map((id) => rename.get(id) ?? id)),
        instructions: draft.instructions.filter((item) => item.title.trim()),
      };
      return apiFetch<ScheduleResponse>(`/api/circles/${circleId}/schedule`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["circle-schedule", circleId], response);
      toast({ title: "Schedule saved" });
      onDone();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not save the schedule",
        description: err.message,
        variant: "destructive",
      }),
  });

  const nameOf = (id: string) =>
    draft.households.find((household) => household.id === id)?.name || "Unnamed household";
  const unnamed = draft.households.some((household) => !household.name.trim());

  return (
    <Card className="flex flex-col gap-6">
      <datalist id="schedule-people">
        {directory.map((person) => (
          <option key={person.id} value={person.displayName} />
        ))}
      </datalist>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-foreground">
          Schedule title
          <Input
            value={draft.title}
            maxLength={80}
            onChange={(event) => update({ title: event.target.value })}
            className="bg-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Starts on
          <Input
            type="date"
            value={draft.startsOn}
            onChange={(event) => event.target.value && update({ startsOn: event.target.value })}
            className="bg-white"
          />
        </label>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-foreground">Households</h3>
        {draft.households.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {draft.households.map((household, index) => (
              <HouseholdRow
                key={household.id}
                household={household}
                people={directory}
                onChange={(next) => setHousehold(index, next)}
                onRemove={() => removeHousehold(index)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No households yet.</p>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit gap-1.5"
          onClick={addHousehold}
          disabled={draft.households.length >= 30}
        >
          <Plus className="h-4 w-4" /> Add household
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Weekly rotation</h3>
          <p className="text-xs text-muted">
            Give each weekday a household. Add more to a day and they take it in turn, one week
            each.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {WEEKDAYS.map((dayName, day) => {
            const turn = draft.weekdays[day];
            const next = addDays(today, (day - weekdayOf(today) + 7) % 7);
            const nextId = regularDuty(draft, next);
            return (
              <li key={dayName} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <span className="w-28 shrink-0 text-sm font-medium text-foreground">{dayName}</span>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {turn.map((id, index) => (
                    <span key={index} className="flex items-center gap-1">
                      {index > 0 ? <span className="text-xs text-muted">then</span> : null}
                      <Select
                        value={id}
                        onChange={(event) =>
                          setTurn(
                            day,
                            turn.map((entry, i) => (i === index ? event.target.value : entry))
                          )
                        }
                        className="h-9 px-2"
                        aria-label={`${dayName}, turn ${index + 1}`}
                      >
                        {draft.households.map((household) => (
                          <option key={household.id} value={household.id}>
                            {household.name || "Unnamed household"}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        className="rounded-full p-1 text-muted hover:bg-accent hover:text-foreground"
                        onClick={() =>
                          setTurn(
                            day,
                            turn.filter((_, i) => i !== index)
                          )
                        }
                        aria-label={`Remove from ${dayName}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {turn.length < 8 && draft.households.length ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-xs"
                      onClick={() => setTurn(day, [...turn, draft.households[0].id])}
                    >
                      <Plus className="h-3.5 w-3.5" /> {turn.length ? "Alternate with…" : "Assign"}
                    </Button>
                  ) : null}
                </div>
                {turn.length > 1 ? (
                  <span className="flex items-center gap-2 text-xs text-muted">
                    Next {dayName.slice(0, 3)}: {nextId ? nameOf(nextId) : "—"}
                    <button
                      type="button"
                      className="font-medium text-secondary-foreground hover:underline"
                      onClick={() => setTurn(day, [...turn.slice(1), turn[0]])}
                    >
                      Shift
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-foreground">What duty involves</h3>
        {draft.instructions.map((item, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Summer duty"
                value={item.title}
                maxLength={60}
                onChange={(event) => setInstructions(index, { ...item, title: event.target.value })}
                className="bg-white font-medium"
                aria-label="Instructions title"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted hover:text-destructive"
                onClick={() =>
                  update({ instructions: draft.instructions.filter((_, i) => i !== index) })
                }
                aria-label="Remove these instructions"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              rows={4}
              placeholder="One step per line"
              value={item.body}
              maxLength={3000}
              onChange={(event) => setInstructions(index, { ...item, body: event.target.value })}
              className="bg-white"
              aria-label="Instructions"
            />
            <MonthToggles
              months={item.months ?? []}
              onChange={(months) => setInstructions(index, { ...item, months })}
            />
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit gap-1.5"
          onClick={() =>
            update({ instructions: [...draft.instructions, { title: "", body: "", months: [] }] })
          }
          disabled={draft.instructions.length >= 6}
        >
          <Plus className="h-4 w-4" /> Add instructions
        </Button>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !draft.title.trim() || !draft.households.length || unnamed}
        >
          {save.isPending ? "Saving…" : "Save schedule"}
        </Button>
        <Button variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        {unnamed ? <span className="text-xs text-muted">Name every household to save.</span> : null}
      </div>
    </Card>
  );
}
