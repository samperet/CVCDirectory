"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { PageEdit, WikiPage } from "@/lib/wiki/store";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";

/**
 * Who can edit a page — its parent circle, or anyone — set by its parent
 * circle (and the Board). Each page has its own setting; everyone can see
 * every page.
 */
export function PageSettings({
  page,
  slug,
  onSaved,
}: {
  page: WikiPage;
  slug: string;
  onSaved: (page: WikiPage) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" /> Who can edit
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

function SettingsDialog({
  page,
  slug,
  onClose,
  onSaved,
}: {
  page: WikiPage;
  slug: string;
  onClose: () => void;
  onSaved: (page: WikiPage) => void;
}) {
  const { toast } = useToast();
  const circles = useCircles() ?? [];
  const [edit, setEdit] = useState<PageEdit["kind"]>(page.edit.kind);
  const keeperName =
    circles.find((circle) => circle.id === page.keeper)?.name ?? "the parent circle";
  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ edit: { kind: edit } }),
      }),
    onSuccess: ({ page: updated }) => {
      toast({ title: "Settings saved" });
      onSaved(updated);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not save the settings",
        description: err.message,
        variant: "destructive",
      }),
  });
  const radio = "h-4 w-4 accent-[#3f7d5c]";
  return (
    <Dialog
      title="Who can edit it"
      icon={<Settings2 className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="sr-only">Who can edit it</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="edit"
            className={radio}
            checked={edit === "keeper"}
            onChange={() => setEdit("keeper")}
          />{" "}
          {keeperName}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="edit"
            className={radio}
            checked={edit === "anyone"}
            onChange={() => setEdit("anyone")}
          />{" "}
          Any resident
        </label>
        <span className="text-xs text-muted">
          Everyone can see it; the Board and admins can always edit it.
        </span>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Dialog>
  );
}
