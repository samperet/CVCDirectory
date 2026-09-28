"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Person } from "@/lib/directory/types";
import { MONTHS } from "@/lib/profiles/months";
import { Avatar } from "@/components/profile/avatar";
import { prepareSquareImage, uploadImage } from "@/lib/image-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

function splitBirthday(value: string | null) {
  const match = value?.match(/^([A-Za-z]+) (\d{1,2})$/);
  return match ? { month: match[1], day: match[2] } : { month: "", day: "" };
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  landline: string;
  month: string;
  day: string;
  bio: string;
}

function toForm(profile: Person): FormState {
  const { month, day } = splitBirthday(profile.birthday);
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    landline: profile.landline ?? "",
    month,
    day,
    bio: profile.bio ?? "",
  };
}

const digits = (value: string) => value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export function ProfileClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [currentPhone, setCurrentPhone] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => apiFetch<{ profile: Person }>("/api/profiles/me"),
  });
  const profile = data?.profile;

  useEffect(() => {
    if (profile && !form) setForm(toForm(profile));
  }, [profile, form]);

  const refreshEverywhere = () => {
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["auth"] });
    queryClient.invalidateQueries({ queryKey: ["directory"] });
  };

  const save = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch<{ profile: Person }>("/api/profiles/me", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (response) => {
      queryClient.setQueryData(["profile", "me"], response);
      setForm(toForm(response.profile));
      setCurrentPhone("");
      refreshEverywhere();
      toast({ title: "Profile saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save profile", description: err.message, variant: "destructive" }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => uploadImage("/api/profiles/me/photo", await prepareSquareImage(file, 400, "image/jpeg")),
    onSuccess: () => {
      refreshEverywhere();
      toast({ title: "Photo updated" });
    },
    onError: (err: Error) => toast({ title: "Could not upload photo", description: err.message, variant: "destructive" }),
  });

  const removePhoto = useMutation({
    mutationFn: () => apiFetch("/api/profiles/me/photo", { method: "DELETE" }),
    onSuccess: refreshEverywhere,
    onError: (err: Error) => toast({ title: "Could not remove photo", description: err.message, variant: "destructive" }),
  });

  if (isLoading || (profile && !form)) return <p className="text-sm text-muted">Loading your profile…</p>;
  if (error || !profile || !form) {
    return (
      <Card>
        <p className="text-sm text-foreground">{(error as Error | null)?.message ?? "Your profile is unavailable."}</p>
      </Card>
    );
  }

  const phonesChanged = digits(form.phone) !== digits(profile.phone ?? "") || digits(form.landline) !== digits(profile.landline ?? "");
  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((current) => (current ? { ...current, [key]: event.target.value } : current));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const body: Record<string, string> = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      birthday: form.month && form.day ? `${form.month} ${form.day}` : "",
      bio: form.bio,
    };
    if (phonesChanged) {
      body.phone = form.phone;
      body.landline = form.landline;
      body.currentPhone = currentPhone;
    }
    save.mutate(body);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Your profile</h1>
        <p className="text-sm text-muted">This is how neighbors see you in the directory.</p>
      </div>

      <Card className="flex flex-col items-center gap-4 sm:flex-row">
        <Avatar name={profile.displayName} photoUrl={profile.photoUrl} size={96} />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <p className="text-lg font-semibold text-foreground">{profile.displayName}</p>
          <p className="text-sm text-muted">
            Unit {profile.unit}
            {profile.role !== "household" ? ` · ${profile.role[0].toUpperCase()}${profile.role.slice(1)}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
                event.target.value = "";
              }}
            />
            <Button size="sm" className="gap-1.5" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
              <Camera className="h-4 w-4" />
              {upload.isPending ? "Uploading…" : profile.photoUrl ? "Change photo" : "Add a photo"}
            </Button>
            {profile.photoUrl ? (
              <Button size="sm" variant="ghost" className="gap-1.5 text-muted" onClick={() => removePhoto.mutate()} disabled={removePhoto.isPending}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              First name
              <Input value={form.firstName} maxLength={50} onChange={set("firstName")} className="bg-white" required />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Last name
              <Input value={form.lastName} maxLength={50} onChange={set("lastName")} className="bg-white" />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Email
            <Input type="email" value={form.email} maxLength={254} onChange={set("email")} className="bg-white" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Mobile phone
              <Input type="tel" inputMode="tel" value={form.phone} maxLength={40} onChange={set("phone")} className="bg-white" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Landline
              <Input type="tel" inputMode="tel" value={form.landline} maxLength={40} onChange={set("landline")} className="bg-white" />
            </label>
          </div>
          <p className="-mt-2 text-xs text-muted">Your phone numbers are also how you sign in.</p>

          {phonesChanged ? (
            <label className="flex flex-col gap-1 rounded-lg border border-border bg-accent/50 p-3 text-sm font-medium text-foreground">
              Current phone number
              <span className="text-xs font-normal text-muted">To change a phone number, confirm the one you sign in with now.</span>
              <Input
                type="password"
                inputMode="tel"
                autoComplete="current-password"
                value={currentPhone}
                onChange={(event) => setCurrentPhone(event.target.value)}
                className="bg-white"
                required
              />
            </label>
          ) : null}

          <fieldset className="flex flex-col gap-1 text-sm font-medium text-foreground">
            <legend className="mb-1">Birthday</legend>
            <div className="flex gap-2">
              <select value={form.month} onChange={set("month")} className="h-10 rounded-lg border border-border bg-white px-3 text-sm" aria-label="Birthday month">
                <option value="">Month</option>
                {MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
              <select value={form.day} onChange={set("day")} className="h-10 rounded-lg border border-border bg-white px-3 text-sm" aria-label="Birthday day">
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            About you
            <Textarea
              rows={3}
              value={form.bio}
              maxLength={500}
              onChange={set("bio")}
              placeholder="A line or two for your neighbors — interests, how long you've lived here…"
              className="bg-white"
            />
          </label>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending || !form.firstName.trim() || (phonesChanged && !currentPhone.trim())}>
              {save.isPending ? "Saving…" : "Save profile"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setForm(toForm(profile))}>
              Reset
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
