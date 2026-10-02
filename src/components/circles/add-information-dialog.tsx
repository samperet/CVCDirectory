"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { DEFAULT_PAGE_COLOR, type PageColor } from "@/lib/wiki/colors";
import type { WikiPage } from "@/lib/wiki/store";
import { ColorSwatches } from "@/components/wiki/color-swatches";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

/**
 * Add information to a circle: name it and pick its colour, and it becomes a
 * wiki page with the circle as its parent (so it shows in the circle's
 * Information) — then it opens for writing.
 */
export function AddInformationDialog({
  circle,
  onClose,
}: {
  circle: { id: string; name: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<PageColor>(DEFAULT_PAGE_COLOR);
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ page: WikiPage }>("/api/wiki/pages", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: "", color, keeper: circle.id }),
      }),
    onSuccess: ({ page }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      router.push(`/wiki/${page.slug}?edit=1`);
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Could not add it", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog
      title="Add Information"
      icon={<BookOpen className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Title
          <Input
            autoFocus
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="bg-white"
            placeholder="e.g. Pellet stove, Work day sign-up"
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Colour
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        <p className="text-xs text-muted">
          It becomes a wiki page with {circle.name} as its parent circle, and opens for writing.
          Type @ in it to link other pages and documents — or to start a new page.
        </p>
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
