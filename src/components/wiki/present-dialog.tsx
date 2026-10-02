"use client";

import { useMemo, useState } from "react";
import { Check, UserPlus, Users, X } from "lucide-react";
import type { PagePerson } from "@/lib/wiki/store";
import { NameCombobox } from "@/components/auth/name-combobox";
import { useDirectory } from "@/components/directory/use-directory";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Who's present — for a page of meeting notes: the page's circle's members
 * as chips to tick (or **All members present**), plus **Add someone** for any
 * other resident, or a guest by name. Saved as the page's `present`, shown
 * under its title.
 */
export function PresentDialog({
  circleId,
  present: initial,
  saving,
  onSave,
  onClose,
}: {
  circleId: string;
  present: PagePerson[];
  saving: boolean;
  onSave: (present: PagePerson[]) => void;
  onClose: () => void;
}) {
  const directory = useDirectory();
  const [present, setPresent] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [guest, setGuest] = useState("");
  const name = (personId: string, fallback = "") =>
    directory?.people.find((person) => person.id === personId)?.displayName ?? fallback;
  const members = useMemo(() => {
    const circle = directory?.circles.find((entry) => entry.id === circleId);
    const seen = new Map<string, string>();
    for (const seat of circle?.seats ?? [])
      if (seat.personId && !seen.has(seat.personId))
        seen.set(seat.personId, name(seat.personId, seat.name ?? ""));
    return Array.from(seen, ([id, label]) => ({ id, name: label })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory, circleId]);
  const people = useMemo(
    () =>
      (directory?.people ?? [])
        .filter((person) => person.resident !== false)
        .map((person) => ({ id: person.id, name: person.displayName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [directory]
  );
  const isPresent = (personId: string) => present.some((entry) => entry.personId === personId);
  const memberIds = new Set(members.map((member) => member.id));
  const others = present.filter((entry) => !entry.personId || !memberIds.has(entry.personId));
  const candidates = people.filter((person) => !memberIds.has(person.id) && !isPresent(person.id));
  const toggle = (member: { id: string; name: string }) =>
    setPresent((current) =>
      current.some((entry) => entry.personId === member.id)
        ? current.filter((entry) => entry.personId !== member.id)
        : [...current, { personId: member.id, name: member.name }]
    );
  const chip =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition";

  return (
    <Dialog
      title="Who's present"
      icon={<Users className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      {members.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">Circle members</p>
            {members.some((member) => !isPresent(member.id)) ? (
              <button
                type="button"
                className="text-sm font-medium text-secondary-foreground hover:underline"
                onClick={() =>
                  setPresent((current) => [
                    ...current,
                    ...members
                      .filter((member) => !current.some((entry) => entry.personId === member.id))
                      .map((member) => ({ personId: member.id, name: member.name })),
                  ])
                }
              >
                All members present
              </button>
            ) : null}
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Circle members">
            {members.map((member) => {
              const here = isPresent(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    aria-pressed={here}
                    onClick={() => toggle(member)}
                    className={cn(
                      chip,
                      here
                        ? "border-primary bg-primary text-primary-foreground shadow-soft"
                        : "border-border bg-white text-foreground hover:bg-accent"
                    )}
                  >
                    {here ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                    {member.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted">{members.length ? "Others" : "Present"}</p>
        <ul className="flex flex-wrap gap-2" aria-label="Others present">
          {others.map((entry) => (
            <li
              key={entry.personId ?? `guest:${entry.name}`}
              className={cn(chip, "border-secondary bg-secondary text-secondary-foreground")}
            >
              {entry.name}
              {!entry.personId ? (
                <span className="text-xs font-normal opacity-70">guest</span>
              ) : null}
              <button
                type="button"
                onClick={() => setPresent((current) => current.filter((other) => other !== entry))}
                className="-mr-1 rounded-full p-0.5 hover:bg-black/10"
                aria-label={`Remove ${entry.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {!adding ? (
            <li>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className={cn(
                  chip,
                  "border-dashed border-border bg-white text-foreground hover:bg-accent"
                )}
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden /> Add someone
              </button>
            </li>
          ) : null}
        </ul>
        {adding ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3">
            <NameCombobox
              users={candidates}
              value={null}
              placeholder="A resident…"
              onChange={(person) => {
                setPresent((current) => [...current, { personId: person.id, name: person.name }]);
                setAdding(false);
              }}
            />
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const guestName = guest.trim();
                if (!guestName) return;
                setPresent((current) => [...current, { name: guestName }]);
                setGuest("");
                setAdding(false);
              }}
            >
              <Input
                value={guest}
                maxLength={80}
                onChange={(event) => setGuest(event.target.value)}
                placeholder="…or a guest's name"
                className="h-10 bg-white"
                aria-label="Guest's name"
              />
              <Button type="submit" variant="outline" disabled={!guest.trim()}>
                Add
              </Button>
            </form>
          </div>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(present)} disabled={saving}>
          {saving ? "Saving…" : "Done"}
        </Button>
      </div>
    </Dialog>
  );
}

/** "Present: Ada Ash, Ben Birch, Sam (guest)" under a page's title. */
export function PresentLine({ present }: { present?: PagePerson[] }) {
  if (!present?.length) return null;
  return (
    <p
      className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-foreground-light"
      data-present
    >
      <Users className="h-4 w-4 text-primary" aria-hidden />
      <span className="font-medium">Present:</span>
      {present.map((entry) => `${entry.name}${entry.personId ? "" : " (guest)"}`).join(", ")}
    </p>
  );
}
