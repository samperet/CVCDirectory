"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { targetKey, type PinTarget, type PinView } from "@/lib/pins/shared";
import { StickyNote } from "@/components/pins/sticky-note";
import { NewNoteDialog } from "@/components/pins/new-note-dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export type BoardResponse = { pins: PinView[]; canPin: boolean; label?: string; noteCircles: { id: string; name: string }[] };

const SHOWN = 5;

export const pinsQuery = (target: PinTarget) => ({
  queryKey: ["pins", targetKey(target)],
  queryFn: () => apiFetch<BoardResponse>(`/api/pins?target=${encodeURIComponent(targetKey(target))}`),
});

export function useUnpin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/pins/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["note-pins"] });
      toast({ title: "Unpinned" });
    },
    onError: (err: Error) => toast({ title: "Could not unpin it", description: err.message, variant: "destructive" }),
  });
}

/**
 * The notes pinned to a place, as stickies: the first five, then "+N more".
 * Those who can pin here get "New note". With nothing pinned it shows only
 * an invitation to those who can pin — or nothing, with `hideWhenEmpty`.
 */
export function PinBoard({
  target,
  title,
  icon,
  hideWhenEmpty = false,
  circleId,
  layout = "grid",
  className,
}: {
  target: PinTarget;
  title: string;
  icon?: React.ReactNode;
  hideWhenEmpty?: boolean;
  /** The circle this board is in: its notes don't need their circle named. */
  circleId?: string;
  /** "stack" for a narrow column. */
  layout?: "grid" | "stack";
  className?: string;
}) {
  const { data } = useQuery(pinsQuery(target));
  const unpin = useUnpin();
  const [all, setAll] = useState(false);
  const [writing, setWriting] = useState(false);
  if (!data) return null;
  const { pins, canPin } = data;
  const canWrite = canPin && data.noteCircles.length > 0;
  if (!pins.length && (hideWhenEmpty || !canWrite)) return null;
  const shown = all ? pins : pins.slice(0, SHOWN);

  return (
    <section className={cn("flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-soft", className)} aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          {icon ?? <Pin className="h-5 w-5 rotate-45 text-primary" aria-hidden />} {title}
        </h2>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium text-secondary-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> New note
          </button>
        ) : null}
      </div>
      {pins.length ? (
        <div className={cn("grid gap-4", layout === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1")}>
          {shown.map((pin) => (
            <StickyNote
              key={pin.id}
              pin={pin}
              showCircle={pin.note.circleId !== circleId}
              onUnpin={pin.canUnpin ? () => unpin.mutate(pin.id) : undefined}
              busy={unpin.isPending}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Nothing pinned yet. Write a note here, or pin a wiki page with its “Pin to…” button.</p>
      )}
      {pins.length > SHOWN ? (
        <button type="button" onClick={() => setAll(!all)} className="w-fit text-sm font-medium text-secondary-foreground hover:underline" aria-expanded={all}>
          {all ? "Show fewer" : `+${pins.length - SHOWN} more`}
        </button>
      ) : null}
      {writing ? <NewNoteDialog target={target} targetLabel={data.label ?? title} circles={data.noteCircles} onClose={() => setWriting(false)} /> : null}
    </section>
  );
}
