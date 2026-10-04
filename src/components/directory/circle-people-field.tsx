"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import type { NamedPerson } from "@/lib/people";
import { PeopleField, personChip } from "@/components/directory/people-field";
import { useDirectory } from "@/components/directory/use-directory";
import { cn } from "@/lib/utils";

/**
 * Choosing people, starting with a circle's: its members as chips to tick
 * (or `allLabel` for every one), then anyone else — another resident, or
 * someone by name (`PeopleField`). Who was present at a meeting, who
 * consented to a document. `people` is the whole choice, in the order made.
 */
export function CirclePeopleField({
  circleId,
  people,
  onChange,
  allLabel,
  othersLabel,
  otherNote,
  otherPlaceholder,
  otherLabel,
}: {
  circleId: string;
  people: NamedPerson[];
  onChange: (people: NamedPerson[]) => void;
  /** The button that ticks every member ("All members present"). */
  allLabel: string;
  /** The others' list, for screen readers ("Others present"). */
  othersLabel: string;
  /** Shown on the chip of someone not in the directory ("guest"). */
  otherNote?: string;
  /** The box for someone else's name, and its label (`PeopleField`'s guest wording by default). */
  otherPlaceholder?: string;
  otherLabel?: string;
}) {
  const directory = useDirectory();
  const members = useMemo(() => {
    const circle = directory?.circles.find((entry) => entry.id === circleId);
    const name = (personId: string, fallback: string) =>
      directory?.people.find((person) => person.id === personId)?.displayName ?? fallback;
    const seen = new Map<string, string>();
    for (const seat of circle?.seats ?? [])
      if (seat.personId && !seen.has(seat.personId))
        seen.set(seat.personId, name(seat.personId, seat.name ?? ""));
    return Array.from(seen, ([id, label]) => ({ id, name: label })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [directory, circleId]);
  const chosen = (personId: string) => people.some((entry) => entry.personId === personId);
  const memberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const others = people.filter((entry) => !entry.personId || !memberIds.has(entry.personId));
  const toggle = (member: { id: string; name: string }) =>
    onChange(
      chosen(member.id)
        ? people.filter((entry) => entry.personId !== member.id)
        : [...people, { personId: member.id, name: member.name }]
    );

  return (
    <>
      {members.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">Circle members</p>
            {members.some((member) => !chosen(member.id)) ? (
              <button
                type="button"
                className="text-sm font-medium text-secondary-foreground hover:underline"
                onClick={() =>
                  onChange([
                    ...people,
                    ...members
                      .filter((member) => !chosen(member.id))
                      .map((member) => ({ personId: member.id, name: member.name })),
                  ])
                }
              >
                {allLabel}
              </button>
            ) : null}
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Circle members">
            {members.map((member) => {
              const on = chosen(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(member)}
                    className={cn(
                      personChip,
                      on
                        ? "border-primary bg-primary text-primary-foreground shadow-soft"
                        : "border-border bg-white text-foreground hover:bg-accent"
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                    {member.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {members.length ? <p className="text-xs font-medium text-muted">Others</p> : null}
        <PeopleField
          people={others}
          exclude={memberIds}
          label={othersLabel}
          otherNote={otherNote}
          otherPlaceholder={otherPlaceholder}
          otherLabel={otherLabel}
          onAdd={(person) => onChange([...people, person])}
          onRemove={(entry) => onChange(people.filter((other) => other !== entry))}
        />
      </div>
    </>
  );
}
