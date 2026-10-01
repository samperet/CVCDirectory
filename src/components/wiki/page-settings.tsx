"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { PageEdit, PageView, WikiPage } from "@/lib/wiki/store";
import { useCircles } from "@/components/wiki/link-data";
import { Dialog } from "@/components/pins/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

/** Who can see a page, in words. */
export function viewLabel(view: PageView, circles: { id: string; name: string }[] | undefined) {
  if (view.kind === "everyone") return "Everyone";
  if (view.kind === "keeper") return "Parent circle only";
  const names = view.circles.map((id) => circles?.find((circle) => circle.id === id)?.name ?? id);
  return `Parent circle and ${names.join(", ")}`;
}

/**
 * Who can see a page and who can edit it, set by its parent circle (and the
 * Board). Each page has its own settings.
 */
export function PageSettings({ page, slug, onSaved }: { page: WikiPage; slug: string; onSaved: (page: WikiPage) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" /> Who can see &amp; edit
      </Button>
      {open ? (
        <SettingsDialog
          page={page}
          slug={slug}
          onClose={() => setOpen(false)}
          onSaved={(updated) => {
            setOpen(false);
            onSaved(updated);
          }}
        />
      ) : null}
    </>
  );
}

function SettingsDialog({ page, slug, onClose, onSaved }: { page: WikiPage; slug: string; onClose: () => void; onSaved: (page: WikiPage) => void }) {
  const { toast } = useToast();
  const circles = useCircles() ?? [];
  const keeper = page.keeper;
  const [viewKind, setViewKind] = useState<PageView["kind"]>(page.view.kind);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(page.view.kind === "circles" ? page.view.circles : []));
  const [edit, setEdit] = useState<PageEdit["kind"]>(page.edit.kind);
  const keeperName = circles.find((circle) => circle.id === keeper)?.name ?? "the parent circle";
  const others = circles.filter((circle) => circle.id !== keeper && circle.id !== "community" && circle.id !== "board");
  const view: PageView = viewKind === "circles" ? { kind: "circles", circles: Array.from(chosen).filter((id) => id !== keeper) } : { kind: viewKind };
  const ready = !(view.kind === "circles" && !view.circles.length);
  const save = useMutation({
    mutationFn: () => apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, { method: "PATCH", body: JSON.stringify({ view, edit: { kind: edit } }) }),
    onSuccess: ({ page: updated }) => {
      toast({ title: "Settings saved" });
      onSaved(updated);
    },
    onError: (err: Error) => toast({ title: "Could not save the settings", description: err.message, variant: "destructive" }),
  });
  const radio = "h-4 w-4 accent-[#3f7d5c]";
  return (
    <Dialog title="Who can see and edit it" icon={<Settings2 className="h-5 w-5 text-primary" />} onClose={onClose}>
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1 font-semibold text-foreground">Who can see it</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="view" className={radio} checked={viewKind === "everyone"} onChange={() => setViewKind("everyone")} /> Everyone
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="view" className={radio} checked={viewKind === "keeper"} onChange={() => setViewKind("keeper")} /> Only {keeperName}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="view" className={radio} checked={viewKind === "circles"} onChange={() => setViewKind("circles")} /> {keeperName} and chosen circles
        </label>
        {viewKind === "circles" ? (
          <div className="ml-6 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border bg-white p-2 sm:grid-cols-2">
            {others.map((circle) => (
              <label key={circle.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#3f7d5c]"
                  checked={chosen.has(circle.id)}
                  onChange={() =>
                    setChosen((current) => {
                      const next = new Set(current);
                      if (next.has(circle.id)) next.delete(circle.id);
                      else next.add(circle.id);
                      return next;
                    })
                  }
                />
                {circle.name}
              </label>
            ))}
          </div>
        ) : null}
        <span className="text-xs text-muted">The Board and admins can always see it.</span>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1 font-semibold text-foreground">Who can edit it</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="edit" className={radio} checked={edit === "keeper"} onChange={() => setEdit("keeper")} /> {keeperName}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="edit" className={radio} checked={edit === "anyone"} onChange={() => setEdit("anyone")} /> Anyone who can see it
        </label>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={!ready || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Dialog>
  );
}
