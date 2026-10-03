"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Mail, Phone, Plus, Search, Trash2, Undo2, UserRoundCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { preparePhoto, uploadImage } from "@/lib/image-client";
import { PhotoPicker } from "@/components/library/photo-picker";
import { useSession } from "@/lib/auth/client";
import type { LoanItem } from "@/lib/library/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";
import { Loading, ErrorCard } from "@/components/ui/status";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { SegmentedControl } from "@/components/ui/segmented";

interface LibraryListing extends LoanItem {
  ownerUnit: number | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  mine: boolean;
  photoUrl: string | null;
}

type Availability = "all" | "available" | "lent";

const SUGGESTED_CATEGORIES = [
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
  return <p className="text-xs text-muted">Ask {item.ownerName} in person.</p>;
}

function OwnerControls({ item }: { item: LibraryListing }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lending, setLending] = useState(false);
  const [lentTo, setLentTo] = useState("");

  const onError = (err: Error) =>
    toast({ title: "Could not update item", description: err.message, variant: "destructive" });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["library"] });

  const update = useMutation({
    mutationFn: (body: { available: boolean; lentTo?: string | null }) =>
      apiFetch(`/api/loan-items/${item.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setLending(false);
      setLentTo("");
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/loan-items/${item.id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  });
  const photoInput = useRef<HTMLInputElement>(null);
  const photo = useMutation({
    mutationFn: async (file: File) =>
      uploadImage(`/api/loan-items/${item.id}/photo`, await preparePhoto(file, 1600)),
    onSuccess: () => {
      refresh();
      toast({ title: item.photoUrl ? "Photo changed" : "Photo added" });
    },
    onError: (err: Error) =>
      toast({ title: "Could not add the photo", description: err.message, variant: "destructive" }),
  });

  if (lending) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate({ available: false, lentTo: lentTo.trim() || null });
        }}
      >
        <Input
          autoFocus
          placeholder="Who has it? (optional)"
          value={lentTo}
          maxLength={80}
          onChange={(event) => setLentTo(event.target.value)}
          className="bg-white"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={update.isPending}>
            Mark as lent out
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setLending(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) photo.mutate(file);
          event.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => photoInput.current?.click()}
        disabled={photo.isPending}
      >
        <Camera className="h-4 w-4" />
        {photo.isPending ? "Uploading…" : item.photoUrl ? "Change photo" : "Add photo"}
      </Button>
      {item.available ? (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLending(true)}>
          <UserRoundCheck className="h-4 w-4" /> Lent out…
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => update.mutate({ available: true })}
          disabled={update.isPending}
        >
          <Undo2 className="h-4 w-4" /> Returned
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5 text-muted hover:text-destructive"
        onClick={async () => {
          if (
            await confirm({
              title: `Remove “${item.title}” from the library?`,
              confirmLabel: "Remove",
              destructive: true,
            })
          )
            remove.mutate();
        }}
        disabled={remove.isPending}
      >
        <Trash2 className="h-4 w-4" /> Remove
      </Button>
    </div>
  );
}

export function LibraryClient() {
  const { toast } = useToast();
  const { user } = useSession();
  const isAdmin = !!user?.isAdmin;
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availability, setAvailability] = useState<Availability>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", category: "", description: "" });
  const [photo, setPhoto] = useState<Blob | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["library"],
    queryFn: () => apiFetch<{ items: LibraryListing[] }>("/api/loan-items"),
  });
  const items = useMemo(() => data?.items ?? [], [data]);

  const categories = useMemo(
    () =>
      Array.from(new Set([...SUGGESTED_CATEGORIES, ...items.map((item) => item.category)])).sort(),
    [items]
  );
  const usedCategories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))).sort(),
    [items]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => !mineOnly || item.mine)
      .filter((item) => !categoryFilter || item.category === categoryFilter)
      .filter(
        (item) =>
          availability === "all" ||
          (availability === "available" ? item.available : !item.available)
      )
      .filter(
        (item) =>
          !q ||
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.ownerName.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(b.available) - Number(a.available) || a.title.localeCompare(b.title));
  }, [items, query, categoryFilter, availability, mineOnly]);

  // List the item, then send its photo (if one was chosen).
  const add = useMutation({
    mutationFn: async () => {
      const { item } = await apiFetch<{ item: LoanItem }>("/api/loan-items", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          category: form.category || undefined,
          description: form.description || undefined,
        }),
      });
      if (!photo) return { photoFailed: null };
      try {
        await uploadImage(`/api/loan-items/${item.id}/photo`, photo);
        return { photoFailed: null };
      } catch (error) {
        return { photoFailed: (error as Error).message };
      }
    },
    onSuccess: ({ photoFailed }) => {
      setForm({ title: "", category: "", description: "" });
      setPhoto(null);
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["library"] });
      if (photoFailed)
        toast({
          title: "Item listed, but the photo didn't upload",
          description: `${photoFailed}. Try Add photo on the item.`,
          variant: "destructive",
        });
      else toast({ title: "Item listed", description: "Neighbors can now ask to borrow it." });
    },
    onError: (err: Error) =>
      toast({ title: "Could not list item", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="gap-1"
          variant={adding ? "outline" : "default"}
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{" "}
          {adding ? "Cancel" : "Lend something"}
        </Button>
        <span className="text-sm text-muted">
          Items you list are shown under your name, with a way to reach you.
        </span>
      </div>

      {adding ? (
        <Card className="flex flex-col gap-4 sm:flex-row">
          <PhotoPicker photo={photo} onChange={setPhoto} className="sm:w-60 sm:shrink-0" />
          <form
            className="flex min-w-0 flex-1 flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (form.title.trim().length >= 2) add.mutate();
            }}
          >
            <Input
              placeholder="What can you lend? e.g. Ladder"
              aria-label="What you're lending"
              value={form.title}
              maxLength={80}
              autoCapitalize="sentences"
              enterKeyHint="next"
              onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
              className="bg-white"
            />
            <Input
              placeholder="Category, e.g. Tools"
              aria-label="Category"
              list="library-categories"
              value={form.category}
              maxLength={40}
              autoCapitalize="words"
              enterKeyHint="next"
              onChange={(event) => setForm((f) => ({ ...f, category: event.target.value }))}
              className="bg-white"
            />
            <datalist id="library-categories">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
            <Textarea
              rows={2}
              placeholder="Details (optional): size, condition, anything a borrower should know"
              aria-label="Details"
              value={form.description}
              maxLength={500}
              autoCapitalize="sentences"
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
              className="bg-white"
            />
            <Button
              type="submit"
              className="w-full sm:w-fit"
              disabled={add.isPending || form.title.trim().length < 2}
            >
              {add.isPending ? (photo ? "Listing and uploading…" : "Listing…") : "List item"}
            </Button>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search items or owners"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-white pl-9"
            aria-label="Search the loan library"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {usedCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
        <SegmentedControl
          label="Filter by availability"
          value={availability}
          onChange={setAvailability}
          options={[
            { value: "all", label: "All" },
            { value: "available", label: "Available" },
            { value: "lent", label: "Lent out" },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-foreground-light">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(event) => setMineOnly(event.target.checked)}
          />
          My items
        </label>
      </div>

      {isLoading ? (
        <Loading>Loading the library…</Loading>
      ) : error ? (
        <ErrorCard error={error} />
      ) : visible.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <Card
              key={item.id}
              className={cn("flex flex-col gap-3 p-5", !item.available && "opacity-80")}
            >
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a stored photo, already sized
                <img
                  src={item.photoUrl}
                  alt={item.title}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-lg bg-accent/40 object-cover"
                />
              ) : null}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-foreground">{item.title}</h2>
                  <p className="text-xs text-muted">{item.category}</p>
                </div>
                <Pill size="xs" tone={item.available ? "secondary" : "outline"}>
                  {item.available ? "Available" : "Lent out"}
                </Pill>
              </div>
              {item.description ? (
                <p className="whitespace-pre-wrap text-sm text-foreground-light">
                  {item.description}
                </p>
              ) : null}
              {!item.available && item.lentTo ? (
                <p className="text-xs text-muted">With {item.lentTo}</p>
              ) : null}
              <p className="text-sm text-foreground">
                {item.mine ? "You" : item.ownerName}
                {item.ownerUnit !== null ? (
                  <span className="ml-1.5 text-xs text-muted">Unit {item.ownerUnit}</span>
                ) : null}
              </p>
              <div className="mt-auto">
                {item.mine ? (
                  <OwnerControls item={item} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {item.available ? <AskToBorrow item={item} /> : null}
                    {isAdmin ? <OwnerControls item={item} /> : null}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-muted">
            {items.length
              ? "No items match these filters."
              : "Nothing listed yet — lend something to get the library started."}
          </p>
        </Card>
      )}
    </div>
  );
}
