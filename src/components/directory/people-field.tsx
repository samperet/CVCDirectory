"use client";

import { useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import type { NamedPerson } from "@/lib/people";
import { NameCombobox } from "@/components/auth/name-combobox";
import { useDirectory } from "@/components/directory/use-directory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A person as a rounded chip (add the colours). */
export const personChip =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition";

/**
 * Naming people on something — who else was present for a meeting, who a log
 * update involved: those named so far as chips (each with ×), then an add
 * button that opens a resident picker and a box for anyone else's name.
 * Residents already named, or in `exclude`, aren't offered again. It has no
 * form of its own, so it can sit inside one: Enter adds, and never submits.
 */
export function PeopleField({
  people,
  onAdd,
  onRemove,
  exclude,
  label,
  addLabel = "Add someone",
  otherNote,
  otherPlaceholder = "…or a guest's name",
  otherLabel = "Guest's name",
}: {
  people: NamedPerson[];
  onAdd: (person: NamedPerson) => void;
  onRemove: (person: NamedPerson) => void;
  exclude?: Set<string>;
  /** What the list is, for screen readers. */
  label: string;
  addLabel?: string;
  /** Shown on the chip of someone who isn't in the directory ("guest"). */
  otherNote?: string;
  otherPlaceholder?: string;
  otherLabel?: string;
}) {
  const directory = useDirectory();
  const [adding, setAdding] = useState(false);
  const [other, setOther] = useState("");
  const candidates = useMemo(() => {
    const named = new Set(people.map((entry) => entry.personId));
    return (directory?.people ?? [])
      .filter((person) => person.resident !== false)
      .filter((person) => !named.has(person.id) && !exclude?.has(person.id))
      .map((person) => ({ id: person.id, name: person.displayName }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [directory, people, exclude]);
  const add = (person: NamedPerson) => {
    onAdd(person);
    setOther("");
    setAdding(false);
  };
  const addOther = () => {
    const name = other.trim();
    if (!name) return;
    if (people.some((entry) => !entry.personId && entry.name === name)) setAdding(false);
    else add({ name });
    setOther("");
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {people.map((entry) => (
          <li
            key={entry.personId ?? `other:${entry.name}`}
            className={cn(personChip, "border-secondary bg-secondary text-secondary-foreground")}
          >
            {entry.name}
            {!entry.personId && otherNote ? (
              <span className="text-xs font-normal opacity-70">{otherNote}</span>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(entry)}
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
                personChip,
                "border-dashed border-border bg-white text-foreground hover:bg-accent"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> {addLabel}
            </button>
          </li>
        ) : null}
      </ul>
      {adding ? (
        <div
          className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3"
          // Inside a form, Enter would send it; here it only picks a name or adds the one typed.
          onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
        >
          <NameCombobox
            users={candidates}
            value={null}
            placeholder="A resident…"
            onChange={(person) => add({ personId: person.id, name: person.name })}
          />
          <div className="flex gap-2">
            <Input
              value={other}
              maxLength={80}
              onChange={(event) => setOther(event.target.value)}
              placeholder={otherPlaceholder}
              className="h-10 bg-white"
              aria-label={otherLabel}
              onKeyDown={(event) => event.key === "Enter" && addOther()}
            />
            <Button type="button" variant="outline" disabled={!other.trim()} onClick={addOther}>
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
