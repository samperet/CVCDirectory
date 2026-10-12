"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { uploadImage } from "@/lib/image-client";
import type { LoanItem } from "@/lib/library/store";
import { PhotoPicker } from "@/components/library/photo-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { SegmentedControl } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";

/**
 * A loan library item in full (opened from its card, or `/library?item=<id>`):
 * its photo, category, details, whose it is and where they live, who has it
 * — with **Ask to borrow** for someone else's, and **Edit** / **Remove** for
 * its owner and admins. Editing changes its name, category, details, photo,
 * and whether it's lent out (and to whom).
 */

export interface LibraryListing extends LoanItem {
  ownerUnit: number | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  mine: boolean;
  photoUrl: string | null;
}

export const SUGGESTED_CATEGORIES = [
  "Tools",
  "Garden",
  "Kitchen",
  "Books",
  "Games",
  "Outdoor",
  "Kids",
  "Electronics",
  "General",
];

/** Categories to suggest as you type (the usual ones, and those already used). */
export function CategoryOptions({ id, categories }: { id: string; categories: string[] }) {
  return (
    <datalist id={id}>
      {categories.map((category) => (
        <option key={category} value={category} />
      ))}
    </datalist>
  );
}

function AskToBorrow({ item }: { item: LibraryListing }) {
  if (item.ownerEmail) {
    const subject = encodeURIComponent(`Borrowing your ${item.title}`);
    const body = encodeURIComponent(
      `Hi ${item.ownerName.split(" ")[0]},\n\nCould I borrow your ${item.title}?\n\nThanks!`
    );
    return (
      <Button asChild size="sm" className="gap-1.5">
        <a href={`mailto:${item.ownerEmail}?subject=${subject}&body=${body}`}>
          <Mail className="h-4 w-4" /> Ask to borrow
        </a>
      </Button>
    );
  }
  if (item.ownerPhone) {
    return (
      <Button asChild size="sm" className="gap-1.5">
        <a href={`tel:${item.ownerPhone.replace(/\D/g, "")}`}>
          <Phone className="h-4 w-4" /> Call to borrow
        </a>
      </Button>
    );
  }
  return <p className="text-sm text-muted">Ask {item.ownerName} in person.</p>;
}

/** Removing an item, after asking. */
export function useRemoveItem() {
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (item: LibraryListing) =>
      apiFetch(`/api/loan-items/${item.id}`, { method: "DELETE" }),
    onSuccess: (_, item) => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      toast({ title: `Removed “${item.title}”` });
    },
    onError: (err: Error) =>
      toast({ title: "Could not remove it", description: err.message, variant: "destructive" }),
  });
  return async (item: LibraryListing) => {
    const sure = await confirm({
      title: `Remove “${item.title}” from the loan library?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (sure) await remove.mutateAsync(item).catch(() => undefined);
    return sure;
  };
}

export function LoanItemDetails({
  item,
  canChange,
  onEdit,
  onClose,
}: {
  item: LibraryListing;
  canChange: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const remove = useRemoveItem();
  return (
    <Dialog title={item.title} onClose={onClose}>
      <div className="flex flex-col gap-3" data-loan-details={item.id}>
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a stored photo, already sized
          <img
            src={item.photoUrl}
            alt={item.title}
            className="aspect-[4/3] w-full rounded-lg bg-accent/40 object-cover"
          />
        ) : null}
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Pill size="xs" tone={item.available ? "secondary" : "outline"}>
            {item.available ? "Available" : "Lent out"}
          </Pill>
          {item.category}
        </p>
        {item.description ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">{item.description}</p>
        ) : null}
        {!item.available ? (
          <p className="text-sm text-foreground-light">
            {item.lentTo ? `Lent out — with ${item.lentTo}.` : "Lent out just now."}
          </p>
        ) : null}
        <p className="text-sm text-foreground">
          {item.mine ? "Yours" : `Lent by ${item.ownerName}`}
          {item.ownerUnit !== null ? (
            <span className="ml-1.5 text-muted">· Unit {item.ownerUnit}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!item.mine && item.available ? <AskToBorrow item={item} /> : null}
          {canChange ? (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted hover:text-destructive"
                onClick={async () => {
                  if (await remove(item)) onClose();
                }}
              >
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

type PhotoChange = { kind: "keep" } | { kind: "new"; photo: Blob } | { kind: "none" };

export function EditLoanItem({
  item,
  categories,
  onClose,
}: {
  item: LibraryListing;
  categories: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: item.title,
    category: item.category,
    description: item.description,
    available: item.available,
    lentTo: item.lentTo ?? "",
  });
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "keep" });
  const save = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/loan-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category.trim() || "General",
          description: form.description.trim(),
          available: form.available,
          lentTo: form.available ? null : form.lentTo.trim() || null,
        }),
      });
      if (photo.kind === "new") await uploadImage(`/api/loan-items/${item.id}/photo`, photo.photo);
      else if (photo.kind === "none" && item.photoUrl)
        await apiFetch(`/api/loan-items/${item.id}/photo`, { method: "DELETE" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      toast({ title: "Saved" });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Could not save it", description: err.message, variant: "destructive" }),
  });
  const set = (change: Partial<typeof form>) => setForm((current) => ({ ...current, ...change }));
  return (
    <Dialog
      title={`Edit “${item.title}”`}
      icon={<Pencil className="h-5 w-5 text-primary" aria-hidden />}
      onClose={save.isPending ? () => undefined : onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (form.title.trim().length >= 2) save.mutate();
        }}
        data-loan-edit
      >
        <PhotoPicker
          photo={photo.kind === "new" ? photo.photo : null}
          currentUrl={photo.kind === "keep" ? item.photoUrl : null}
          onChange={(chosen) =>
            setPhoto(chosen ? { kind: "new", photo: chosen } : { kind: "none" })
          }
          className="max-h-56"
        />
        <Input
          aria-label="What you're lending"
          value={form.title}
          maxLength={80}
          onChange={(event) => set({ title: event.target.value })}
          className="bg-white"
        />
        <Input
          aria-label="Category"
          list="library-categories-edit"
          value={form.category}
          maxLength={40}
          onChange={(event) => set({ category: event.target.value })}
          className="bg-white"
        />
        <CategoryOptions id="library-categories-edit" categories={categories} />
        <Textarea
          rows={3}
          aria-label="Details"
          placeholder="Details (optional): size, condition, anything a borrower should know"
          value={form.description}
          maxLength={500}
          onChange={(event) => set({ description: event.target.value })}
          className="bg-white"
        />
        <SegmentedControl
          label="Is it available?"
          value={form.available ? "available" : "lent"}
          onChange={(value) => set({ available: value === "available" })}
          options={[
            { value: "available", label: "Available" },
            { value: "lent", label: "Lent out" },
          ]}
        />
        {form.available ? null : (
          <Input
            aria-label="Who has it?"
            placeholder="Who has it? (optional)"
            value={form.lentTo}
            maxLength={80}
            onChange={(event) => set({ lentTo: event.target.value })}
            className="bg-white"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || form.title.trim().length < 2}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
