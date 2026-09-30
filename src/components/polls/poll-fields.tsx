"use client";

import { Plus, X } from "lucide-react";
import { MAX_POLL_OPTIONS } from "@/lib/polls/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PollDraft {
  options: string[];
  multiple: boolean;
  /** Voters may add options of their own. */
  allowOther: boolean;
  /** A date (YYYY-MM-DD), or "" for no closing date. */
  closesOn: string;
}

export const emptyPollDraft = (): PollDraft => ({ options: ["", ""], multiple: false, allowOther: false, closesOn: "" });

/** The filled-in options of a draft. */
export const draftOptions = (draft: PollDraft) => draft.options.map((option) => option.trim()).filter(Boolean);

/** What the server takes for a new poll: it closes at the end of the chosen day, where its author is. */
export const pollPayload = (draft: PollDraft) => ({
  options: draftOptions(draft),
  multiple: draft.multiple,
  allowOther: draft.allowOther,
  closesAt: draft.closesOn ? new Date(`${draft.closesOn}T23:59:59`).toISOString() : null,
});

/** A poll's options (2–10), whether several can be chosen, whether voters can add their own, and an optional closing date. */
export function PollFields({ draft, onChange }: { draft: PollDraft; onChange: (draft: PollDraft) => void }) {
  const { options, multiple, allowOther, closesOn } = draft;
  const setOptions = (update: (current: string[]) => string[]) => onChange({ ...draft, options: update(options) });
  const setMultiple = (value: boolean) => onChange({ ...draft, multiple: value });
  const setClosesOn = (value: string) => onChange({ ...draft, closesOn: value });
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3">
      <legend className="px-1 text-sm font-semibold text-foreground">Poll options</legend>
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={option}
            maxLength={120}
            placeholder={`Option ${index + 1}`}
            onChange={(e) => setOptions((current) => current.map((entry, i) => (i === index ? e.target.value : entry)))}
            className="bg-white"
            aria-label={`Option ${index + 1}`}
          />
          {options.length > 2 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted"
              onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
              aria-label={`Remove option ${index + 1}`}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ))}
      {options.length < MAX_POLL_OPTIONS ? (
        <Button type="button" variant="outline" size="sm" className="w-fit gap-1" onClick={() => setOptions((current) => [...current, ""])}>
          <Plus className="h-4 w-4" /> Add option
        </Button>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm text-foreground">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="h-4 w-4 accent-primary" />
          Allow more than one choice
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allowOther} onChange={(e) => onChange({ ...draft, allowOther: e.target.checked })} className="h-4 w-4 accent-primary" />
          Let people add their own options
        </label>
        <label className="flex items-center gap-2">
          Closes on
          <Input
            type="date"
            value={closesOn}
            min={new Date().toLocaleDateString("en-CA")}
            onChange={(e) => setClosesOn(e.target.value)}
            className="h-9 w-auto bg-white"
          />
          <span className="text-xs text-muted">(optional)</span>
        </label>
      </div>
    </fieldset>
  );
}
