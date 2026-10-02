"use client";

import { AlertTriangle } from "lucide-react";
import type { PageEditor } from "@/lib/wiki/presence";
import type { MergeConflict } from "@/lib/wiki/merge";
import { timeAgo } from "@/lib/time";
import { initials } from "@/lib/text";
import { Button } from "@/components/ui/button";
import type { Draft } from "@/components/wiki/draft-storage";

/**
 * Notices above the wiki editor: a draft left from last time, who else is
 * editing the page, and a paragraph both of you changed (yours stays in
 * the page; theirs is offered).
 */

/** A paragraph someone else changed while you were changing it too. */
export type Clash = MergeConflict & { id: number; by: string };

export function DraftBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: Draft;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sun/60 bg-sun/10 px-3 py-2 text-sm">
      <span className="flex-1">
        You have unsaved changes to this page from {timeAgo(draft.savedAt)}.
      </span>
      <Button size="sm" onClick={onRestore}>
        Restore them
      </Button>
      <Button size="sm" variant="ghost" onClick={onDiscard}>
        Discard
      </Button>
    </div>
  );
}

const names = (people: PageEditor[]) =>
  people.length <= 2
    ? people.map((person) => person.name).join(" and ")
    : `${people
        .slice(0, -1)
        .map((person) => person.name)
        .join(", ")}, and ${people[people.length - 1].name}`;

export function LiveEditors({ editors }: { editors: PageEditor[] }) {
  if (!editors.length) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-foreground-light" aria-live="polite">
      <span className="flex -space-x-1.5">
        {editors.slice(0, 5).map((editor) => (
          <span
            key={editor.userId}
            title={editor.name}
            className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground ring-2 ring-white"
          >
            {initials(editor.name)}
          </span>
        ))}
      </span>
      <span>
        {names(editors)} {editors.length === 1 ? "is" : "are"} editing too — their changes appear
        here as they save.
      </span>
    </div>
  );
}

export function ClashCard({
  clash,
  onTakeTheirs,
  onKeepMine,
}: {
  clash: Clash;
  onTakeTheirs: () => void;
  onKeepMine: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-sun/70 bg-sun/10 px-3 py-2 text-sm"
      role="alert"
    >
      <p className="flex items-center gap-2 font-medium text-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[#b7791f]" /> {clash.by} changed a paragraph
        you&apos;re changing too.
      </p>
      <p className="text-xs text-foreground-light">Yours is in the page. Theirs:</p>
      <blockquote className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-white/80 px-3 py-2 text-sm text-foreground">
        {clash.theirs}
      </blockquote>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onTakeTheirs}>
          Use theirs
        </Button>
        <Button size="sm" variant="ghost" onClick={onKeepMine}>
          Keep mine
        </Button>
      </div>
    </div>
  );
}
