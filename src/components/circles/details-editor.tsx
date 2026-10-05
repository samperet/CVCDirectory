"use client";

import type { Circle } from "@/lib/circles/types";
import { groupLocal, publicMailDomain } from "@/lib/groups/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** A circle's details while its page is being edited (saved with the rest by the page's Save). */
export interface DetailsDraft {
  name: string;
  description: string;
  club: boolean;
  /** Its group email address part. */
  emailName: string;
}

export const detailsDraftOf = (circle: Circle): DetailsDraft => ({
  name: circle.name,
  description: circle.description ?? "",
  club: circle.kind === "club",
  emailName: groupLocal(circle),
});

/**
 * A circle's name, description and group email address, edited in place in
 * its page's header — and, for the Board and admins, whether it's an
 * official circle or a social club. (Community has no address.)
 */
export function DetailsFields({
  value,
  onChange,
  canSetKind,
  hasAddress,
}: {
  value: DetailsDraft;
  onChange: (value: DetailsDraft) => void;
  canSetKind: boolean;
  hasAddress: boolean;
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
      {hasAddress ? (
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Group email address
          <span className="flex items-center overflow-hidden rounded-md border border-input bg-white focus-within:ring-2 focus-within:ring-ring">
            <input
              value={value.emailName}
              maxLength={40}
              onChange={(event) =>
                onChange({
                  ...value,
                  emailName: event.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""),
                })
              }
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              aria-label="Group email address"
              spellCheck={false}
              autoCapitalize="none"
            />
            <span className="shrink-0 border-l border-input bg-accent/50 px-3 py-2 text-sm text-muted">
              @{publicMailDomain()}
            </span>
          </span>
          <span className="text-xs font-normal text-muted">
            The old address keeps working after a change. Leave it empty to use one made from the
            name.
          </span>
        </label>
      ) : null}
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
