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
 * A page's settings, for its parent circle (and the Board): who can edit
 * it — the parent circle, or anyone (each page has its own setting;
 * everyone can see every page) — and whether it's offered as a template
 * for new pages (`lib/wiki/templates.ts`).
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
        <Settings2 className="h-4 w-4" /> Settings
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
  const [template, setTemplate] = useState(!!page.template);
  const keeperName =
    circles.find((circle) => circle.id === page.keeper)?.name ?? "the parent circle";
  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ edit: { kind: edit }, template }),
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
      title="Page settings"
      icon={<Settings2 className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1 font-medium text-foreground">Who can edit it</legend>
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
      <label className="flex items-start gap-2 text-sm" data-template-setting>
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#3f7d5c]"
          checked={template}
          onChange={(event) => setTemplate(event.target.checked)}
        />
        <span>
          <span className="font-medium text-foreground">Use as a template</span>
          <span className="block text-xs text-muted">
            Anyone starting a page can start from a copy of this one. Write {"{{date}}"} or{" "}
            {"{{circle}}"} for the day and the new page&apos;s circle; its polls and proposals
            aren&apos;t copied.
          </span>
        </span>
      </label>

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
