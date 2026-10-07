"use client";

import type { Circle } from "@/lib/circles/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** A circle's details while its page is being edited (saved with the rest by the page's Save). */
export interface DetailsDraft {
  name: string;
  description: string;
  club: boolean;
}

export const detailsDraftOf = (circle: Circle): DetailsDraft => ({
  name: circle.name,
  description: circle.description ?? "",
  club: circle.kind === "club",
});

/**
 * A circle's name and description, edited in place in its page's header —
 * and, for the Board and admins, whether it's an official circle or a
 * social club.
 */
export function DetailsFields({
  value,
  onChange,
  canSetKind,
}: {
  value: DetailsDraft;
  onChange: (value: DetailsDraft) => void;
  canSetKind: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        value={value.name}
        maxLength={80}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        className="bg-white font-display text-lg font-semibold"
        aria-label="Circle name"
      />
      <Textarea
        rows={3}
        placeholder="What does this circle take care of?"
        value={value.description}
        maxLength={1000}
        onChange={(event) => onChange({ ...value, description: event.target.value })}
        className="bg-white"
        aria-label="Description"
      />
      {canSetKind ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={value.club}
            onChange={(event) => onChange({ ...value, club: event.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Social club <span className="text-muted">— not an official sociocratic circle</span>
        </label>
      ) : null}
    </div>
  );
}
