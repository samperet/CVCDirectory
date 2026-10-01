"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StickyNote as StickyIcon } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { NoteColor, PinTarget, PinView } from "@/lib/pins/shared";
import { ColorSwatches } from "@/components/pins/color-swatches";
import { Dialog, PinDetailsFields } from "@/components/pins/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

/**
 * Write a note and pin it here in one go. It becomes a page in the chosen
 * circle's wiki, where it can be written up in full later.
 */
export function NewNoteDialog({
  target,
  targetLabel,
  circles,
  onClose,
}: {
  target: PinTarget;
  targetLabel: string;
  /** The wikis you can write in; the first is the likeliest. */
  circles: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [color, setColor] = useState<NoteColor>("yellow");
  const [circleId, setCircleId] = useState(circles[0]?.id ?? "");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ pin: PinView | null }>("/api/pins", {
        method: "POST",
        body: JSON.stringify({ newNote: { circleId, title: title.trim(), body, color }, target, until: until || null, reason: reason.trim() || null }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["wiki", circleId] });
      toast({ title: "Note pinned", description: `Pinned to ${targetLabel}` });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Could not add the note", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog title="New note" icon={<StickyIcon className="h-5 w-5 text-primary" aria-hidden />} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && circleId) create.mutate();
        }}
      >
        <p className="text-sm text-muted">Pinned to {targetLabel}. It&apos;s saved as a wiki page, so it can be expanded and linked later.</p>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Title
          <Input autoFocus required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="bg-white" placeholder="Pellet stove: weekly check" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Note
          <Textarea rows={5} maxLength={50_000} value={body} onChange={(event) => setBody(event.target.value)} className="bg-white" placeholder="A few lines; Markdown and [[links]] work." />
        </label>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Colour
            <ColorSwatches value={color} onChange={setColor} />
          </div>
          {circles.length > 1 ? (
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-foreground sm:max-w-[13rem]">
              In the wiki of
              <select value={circleId} onChange={(event) => setCircleId(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-foreground">
                {circles.map((circle) => (
                  <option key={circle.id} value={circle.id}>
                    {circle.name}
                  </option>
                ))}
              </select>
            </label>
          ) : circles[0] ? (
            <p className="text-xs text-muted">In the {circles[0].name} wiki</p>
          ) : null}
        </div>
        <PinDetailsFields until={until} reason={reason} onUntil={setUntil} onReason={setReason} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim() || !circleId || create.isPending}>
            {create.isPending ? "Pinning…" : "Add note"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
