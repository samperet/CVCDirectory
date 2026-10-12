"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { uploadImage } from "@/lib/image-client";
import { PhotoPicker } from "@/components/library/photo-picker";
import {
  CategoryOptions,
  EditLoanItem,
  LoanItemDetails,
  SUGGESTED_CATEGORIES,
  useRemoveItem,
  type LibraryListing,
} from "@/components/library/loan-item-dialogs";
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
import { SegmentedControl } from "@/components/ui/segmented";
import { ON_HOVER } from "@/components/ui/hover";

/**
 * The loan library: things residents lend each other. Each card is just
 * its photo, name, whether it's available, and whose it is; clicking it
 * opens the rest (`loan-item-dialogs.tsx`) with **Ask to borrow**. An
 * item's owner and admins get **Edit** and **Delete** on the card when they
 * point at it (always shown on touch screens). `/library?item=<id>` opens
 * one item, as site search links it.
 */

/** An icon button among a card's hover actions. */
const action =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground-light transition hover:bg-accent hover:text-foreground";

type Availability = "all" | "available" | "lent";

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
  // The item opened (its details) or being edited, by id.
  const [opened, setOpened] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const remove = useRemoveItem();
  // `/library?item=<id>` (site search) opens that item.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("item");
    if (id) setOpened(id);
  }, []);
  const close = () => {
    setOpened(null);
    if (window.location.search) window.history.replaceState(null, "", "/library");
  };

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

  const openedItem = items.find((item) => item.id === opened);
  const editingItem = items.find((item) => item.id === editing);

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
          description: `${photoFailed}. Try again from Edit on the item.`,
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
            <CategoryOptions id="library-categories" categories={categories} />
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
            <p className="text-xs text-muted">
              Items you list are shown under your name, with a way to reach you.
            </p>
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
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => {
            const canChange = item.mine || isAdmin;
            return (
              <Card
                key={item.id}
                className={cn(
                  "group/post relative flex flex-col overflow-hidden p-0",
                  !item.available && "opacity-80"
                )}
                data-loan-item={item.id}
              >
                {item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a stored photo, already sized
                  <img
                    src={item.photoUrl}
                    alt={item.title}
                    loading="lazy"
                    className="aspect-[4/3] w-full bg-accent/40 object-cover"
                  />
                ) : null}
                <div
                  className={cn(
                    "flex flex-col gap-1.5 p-3 sm:p-4",
                    // Room for Edit and Delete beside the name, with no photo for them to sit on.
                    canChange && !item.photoUrl && "pr-20 sm:pr-20"
                  )}
                >
                  <h2 className="break-words font-semibold leading-snug text-foreground">
                    {/* The title's button covers the card: anywhere on it opens the details. */}
                    <button
                      type="button"
                      onClick={() => setOpened(item.id)}
                      className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                    >
                      {item.title}
                    </button>
                  </h2>
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground-light">
                    <Pill size="xs" tone={item.available ? "secondary" : "outline"}>
                      {item.available ? "Available" : "Lent out"}
                    </Pill>
                    <span className="min-w-0 truncate">{item.mine ? "You" : item.ownerName}</span>
                  </p>
                </div>
                {canChange ? (
                  <div
                    className={cn(
                      "absolute right-2 top-2 z-10 flex gap-0.5 rounded-lg bg-white/90 p-0.5 shadow-soft",
                      ON_HOVER
                    )}
                  >
                    <button
                      type="button"
                      className={action}
                      onClick={() => setEditing(item.id)}
                      aria-label={`Edit ${item.title}`}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn(action, "hover:bg-destructive/10 hover:text-destructive")}
                      onClick={() => void remove(item)}
                      aria-label={`Delete ${item.title}`}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </Card>
            );
          })}
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
      {openedItem ? (
        <LoanItemDetails
          item={openedItem}
          canChange={openedItem.mine || isAdmin}
          onEdit={() => {
            close();
            setEditing(openedItem.id);
          }}
          onClose={close}
        />
      ) : null}
      {editingItem ? (
        <EditLoanItem
          key={editingItem.id}
          item={editingItem}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
