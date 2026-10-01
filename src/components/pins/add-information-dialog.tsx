"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { DEFAULT_NOTE_COLOR, type NoteColor, type PinView } from "@/lib/pins/shared";
import { ColorSwatches } from "@/components/pins/color-swatches";
import { Dialog } from "@/components/pins/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

/**
 * Add information to a circle: name it and pick its colour, and it becomes a
 * page in the circle's wiki, shown on the circle's page — then it opens for
 * writing.
 */
export function AddInformationDialog({ circle, onClose }: { circle: { id: string; name: string }; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<NoteColor>(DEFAULT_NOTE_COLOR);
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ pin: PinView | null }>("/api/pins", {
        method: "POST",
        body: JSON.stringify({ newNote: { circleId: circle.id, title: title.trim(), body: "", color }, target: { kind: "circle", id: circle.id } }),
      }),
    onSuccess: ({ pin }) => {
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      if (pin) router.push(`${pin.note.href}?edit=1`);
      onClose();
    },
    onError: (err: Error) => toast({ title: "Could not add it", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog title="Add Information" icon={<BookOpen className="h-5 w-5 text-primary" aria-hidden />} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Title
          <Input autoFocus required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="bg-white" placeholder="e.g. Pellet stove, Work day sign-up" />
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Colour
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        <p className="text-xs text-muted">It goes on {circle.name}&apos;s page and opens for writing. Type @ in it to link other pages and documents — or to start a new page.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Adding…" : "Add and write"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
