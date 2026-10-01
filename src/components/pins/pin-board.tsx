"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { targetKey, type PinTarget, type PinView } from "@/lib/pins/shared";
import { StickyNote } from "@/components/pins/sticky-note";
import { FullNote, TitleList } from "@/components/pins/note-views";
import type { InfoView } from "@/lib/circles/layout";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export type BoardResponse = { pins: PinView[]; canPin: boolean; label?: string; canAdd: boolean };

const SHOWN = 6;

/** `full`: with each page's whole text (for showing pages in full). */
export const pinsQuery = (target: PinTarget, { full = false } = {}) => ({
  queryKey: ["pins", targetKey(target), ...(full ? ["full"] : [])],
  queryFn: () => apiFetch<BoardResponse>(`/api/pins?target=${encodeURIComponent(targetKey(target))}${full ? "&full=1" : ""}`),
});

export function useUnpin(done = "Unpinned") {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/pins/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["note-pins"] });
      toast({ title: done });
    },
    onError: (err: Error) => toast({ title: "Could not take it off", description: err.message, variant: "destructive" }),
  });
}

/**
 * Pages as cards (the first six, then "+N more") — or, by `view`, each in
 * full (the first three), or just their titles (all of them).
 */
export function StickyGrid({
  pins,
  circleId,
  layout = "grid",
  view = "summary",
  onUnpin,
  busy,
}: {
  pins: PinView[];
  /** The circle this is in: its pages don't need their circle named. */
  circleId?: string;
  layout?: "grid" | "stack";
  view?: InfoView;
  onUnpin: (pin: PinView) => void;
  busy: boolean;
}) {
  const [all, setAll] = useState(false);
  if (view === "titles") return <TitleList pins={pins} circleId={circleId} onUnpin={onUnpin} busy={busy} />;
  const limit = view === "full" ? 3 : SHOWN;
  const shown = all ? pins : pins.slice(0, limit);
  return (
    <>
      {view === "full" ? (
        <div className="flex flex-col gap-4">
          {shown.map((pin) => (
            <FullNote key={pin.id} pin={pin} showCircle={pin.note.circleId !== circleId} onUnpin={pin.canUnpin ? () => onUnpin(pin) : undefined} busy={busy} />
          ))}
        </div>
      ) : (
        <div className={cn("grid gap-4", layout === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
          {shown.map((pin) => (
            <StickyNote key={pin.id} pin={pin} showCircle={pin.note.circleId !== circleId} onUnpin={pin.canUnpin ? () => onUnpin(pin) : undefined} busy={busy} />
          ))}
        </div>
      )}
      {pins.length > limit ? (
        <button type="button" onClick={() => setAll(!all)} className="w-fit text-sm font-medium text-secondary-foreground hover:underline" aria-expanded={all}>
          {all ? "Show fewer" : `+${pins.length - limit} more`}
        </button>
      ) : null}
    </>
  );
}

/**
 * The pages pinned to a place (the community dashboard), as
 * cards — shown only when something's pinned. Pages are pinned from their
 * own "Pin to…" button.
 */
export function PinBoard({
  target,
  title,
  icon,
  circleId,
  layout = "grid",
  className,
}: {
  target: PinTarget;
  title: string;
  icon?: React.ReactNode;
  circleId?: string;
  /** "stack" for a narrow column. */
  layout?: "grid" | "stack";
  className?: string;
}) {
  const { data } = useQuery(pinsQuery(target));
  const unpin = useUnpin();
  if (!data?.pins.length) return null;
  return (
    <section className={cn("flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-soft", className)} aria-label={title}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        {icon ?? <Pin className="h-5 w-5 rotate-45 text-primary" aria-hidden />} {title}
      </h2>
      <StickyGrid pins={data.pins} circleId={circleId} layout={layout} onUnpin={(pin) => unpin.mutate(pin.id)} busy={unpin.isPending} />
    </section>
  );
}
