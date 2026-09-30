"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ExternalLink, Globe, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { HomeListing, HomeStatus } from "@/lib/homes/store";
import { preparePhoto, uploadImage } from "@/lib/image-client";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const KEY = ["homes"];
export const STATUS_LABELS: Record<HomeStatus, string> = { available: "For sale", pending: "Sale pending", sold: "Sold (hidden)" };
const photoUrl = (home: HomeListing) => (home.photo ? `/api/homes/${home.id}/photo?v=${encodeURIComponent(home.photo.updatedAt)}` : null);

interface FormState {
  title: string;
  unit: string;
  price: string;
  details: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  link: string;
  status: HomeStatus;
}

const toForm = (home?: HomeListing): FormState => ({
  title: home?.title ?? "",
  unit: home?.unit ? String(home.unit) : "",
  price: home?.price ?? "",
  details: home?.details ?? "",
  description: home?.description ?? "",
  contactName: home?.contactName ?? "",
  contactEmail: home?.contactEmail ?? "",
  contactPhone: home?.contactPhone ?? "",
  link: home?.link ?? "",
  status: home?.status ?? "available",
});

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm font-medium text-foreground", className)}>
      <span>
        {label} {hint ? <span className="font-normal text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

/** Add or edit a listing, with an optional photo. */
function HomeForm({ home, onDone }: { home?: HomeListing; onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(home));
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(home ? photoUrl(home) : null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({ ...form, unit: form.unit ? Number(form.unit) : null });
      const { home: saved } = home
        ? await apiFetch<{ home: HomeListing }>(`/api/homes/${home.id}`, { method: "PATCH", body })
        : await apiFetch<{ home: HomeListing }>("/api/homes", { method: "POST", body });
      if (photo) await uploadImage(`/api/homes/${saved.id}/photo`, await preparePhoto(photo, 1600));
      else if (removePhoto && home?.photo) await apiFetch(`/api/homes/${saved.id}/photo`, { method: "DELETE" });
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: home ? "Listing saved" : "Home listed", description: form.status === "sold" ? "It's hidden from the homepage." : "It's on the public homepage." });
      onDone();
    },
    onError: (error: Error) => toast({ title: "Could not save the listing", description: error.message, variant: "destructive" }),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="rounded-lg border border-sun/60 bg-sun/10 px-3 py-2 text-sm text-foreground">
        <Globe className="mr-1 inline h-4 w-4 align-text-bottom" /> Everything here — including the contact details — appears on the public homepage while the home is for sale or
        sale pending.
      </p>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Field label="Title">
          <Input required value={form.title} maxLength={120} onChange={set("title")} placeholder="e.g. Sunny 3-bedroom on the green" className="bg-white" />
        </Field>
        <Field label="Unit" hint="(optional)">
          <Input type="number" min={1} max={999} value={form.unit} onChange={set("unit")} className="bg-white" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price" hint="(optional)">
          <Input value={form.price} maxLength={40} onChange={set("price")} placeholder="e.g. $525,000" className="bg-white" />
        </Field>
        <Field label="Details" hint="(optional)">
          <Input value={form.details} maxLength={160} onChange={set("details")} placeholder="e.g. 3 bedrooms · 2 baths · 1,450 sq ft" className="bg-white" />
        </Field>
      </div>
      <Field label="Description" hint="(optional)">
        <Textarea rows={4} value={form.description} maxLength={2000} onChange={set("description")} className="bg-white" />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">
          Photo <span className="font-normal text-muted">(optional)</span>
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {preview && !removePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview or a stored listing photo
            <img src={preview} alt="" className="h-20 w-28 rounded-lg border border-border object-cover" />
          ) : null}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                setPhoto(file);
                setRemovePhoto(false);
                setPreview(URL.createObjectURL(file));
              }
              event.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInput.current?.click()}>
            <Camera className="h-4 w-4" /> {preview && !removePhoto ? "Change photo" : "Add a photo"}
          </Button>
          {preview && !removePhoto ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted"
              onClick={() => {
                setPhoto(null);
                setRemovePhoto(true);
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-border bg-accent/30 p-3 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold text-foreground">Contact for buyers</legend>
        <Field label="Name">
          <Input required value={form.contactName} maxLength={80} onChange={set("contactName")} placeholder="Seller or agent" className="bg-white" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.contactEmail} maxLength={254} onChange={set("contactEmail")} className="bg-white" />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={form.contactPhone} maxLength={30} onChange={set("contactPhone")} className="bg-white" />
        </Field>
        <p className="text-xs text-muted sm:col-span-3">Give an email address, a phone number, or both.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Listing link" hint="(optional — e.g. the realtor's page)">
          <Input type="url" value={form.link} maxLength={500} onChange={set("link")} placeholder="https://" className="bg-white" />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={set("status")} className="h-10 rounded-lg border border-border bg-white px-3 text-sm">
            {(Object.keys(STATUS_LABELS) as HomeStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : home ? "Save listing" : "List this home"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ListingCard({ home, onEdit }: { home: HomeListing; onEdit: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const setStatus = useMutation({
    mutationFn: (status: HomeStatus) => apiFetch(`/api/homes/${home.id}`, { method: "PATCH", body: JSON.stringify({ ...toForm(home), unit: home.unit, status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (error: Error) => toast({ title: "Could not update", description: error.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/homes/${home.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Listing removed" });
    },
    onError: (error: Error) => toast({ title: "Could not remove", description: error.message, variant: "destructive" }),
  });
  const photo = photoUrl(home);
  return (
    <Card className={cn("flex flex-col gap-4 p-5 sm:flex-row", home.status === "sold" && "opacity-70")}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored listing photo
        <img src={photo} alt="" className="h-32 w-full shrink-0 rounded-lg object-cover sm:h-28 sm:w-40" />
      ) : (
        <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-lg bg-accent text-xs text-muted sm:w-40">No photo</div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{home.title}</h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              home.status === "available" ? "bg-primary/30 text-primary-foreground" : home.status === "pending" ? "bg-sun/30 text-foreground" : "bg-border text-muted"
            )}
          >
            {STATUS_LABELS[home.status]}
          </span>
        </div>
        <p className="text-sm text-foreground-light">
          {[home.unit ? `Unit ${home.unit}` : null, home.price, home.details].filter(Boolean).join(" · ")}
        </p>
        <p className="text-sm text-foreground-light">
          Contact: {home.contactName}
          {home.contactEmail ? ` · ${home.contactEmail}` : ""}
          {home.contactPhone ? ` · ${home.contactPhone}` : ""}
        </p>
        {home.link ? (
          <a href={home.link} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-secondary-foreground hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Listing link
          </a>
        ) : null}
        <p className="text-xs text-muted">
          Updated by {home.updatedBy} · {timeAgo(home.updatedAt)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <select
            value={home.status}
            onChange={(event) => setStatus.mutate(event.target.value as HomeStatus)}
            disabled={setStatus.isPending}
            className="h-9 rounded-lg border border-border bg-white px-2 text-sm"
            aria-label={`Status of ${home.title}`}
          >
            {(Object.keys(STATUS_LABELS) as HomeStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted hover:text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Remove the listing “${home.title}”?`)) remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Homes for sale, for admins and the Board: list a home, edit it, mark it pending or sold. */
export function HomesClient() {
  const { user } = useSession();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<{ homes: HomeListing[] }>("/api/homes"),
    enabled: !!user?.canManageHomes,
  });
  if (user && !user.canManageHomes) {
    return (
      <Card>
        <p className="text-sm text-foreground">Only admins and the Board can manage homes for sale.</p>
      </Card>
    );
  }
  const homes = data?.homes ?? [];
  const current = editing && editing !== "new" ? homes.find((home) => home.id === editing) : undefined;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Homes for sale</h1>
        <div className="flex items-center gap-3">
          <Link href="/welcome#homes-for-sale" className="text-sm font-medium text-secondary-foreground hover:underline">
            See it on the homepage
          </Link>
          {editing === null ? (
            <Button className="gap-1" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> List a home
            </Button>
          ) : null}
        </div>
      </div>
      {editing !== null ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{current ? `Edit “${current.title}”` : "List a home"}</h2>
            <Button variant="ghost" size="icon" onClick={() => setEditing(null)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <HomeForm key={editing} home={current} onDone={() => setEditing(null)} />
        </Card>
      ) : null}
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <Card>
          <p className="text-sm text-foreground">{(error as Error).message}</p>
        </Card>
      ) : homes.length ? (
        <div className="flex flex-col gap-3">
          {homes.map((home) => (
            <ListingCard key={home.id} home={home} onEdit={() => setEditing(home.id)} />
          ))}
        </div>
      ) : editing === null ? (
        <Card>
          <p className="text-sm text-muted">No homes listed.</p>
        </Card>
      ) : null}
    </div>
  );
}
