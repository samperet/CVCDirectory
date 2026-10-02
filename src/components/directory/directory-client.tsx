"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Car, Search, UserPlus } from "lucide-react";
import { SectionArt } from "@/components/layout/section-art";
import { apiFetch } from "@/lib/api-client";
import type { DirectoryDocument, Person } from "@/lib/directory/types";
import type { Circle } from "@/lib/circles/types";
import { unitsOf } from "@/lib/directory/households";
import { CircleIcon } from "@/components/circles/circle-icon";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MONTHS } from "@/lib/profiles/months";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/profile/avatar";
import { useSession } from "@/lib/auth/client";
import { useDirectoryQuery } from "@/components/directory/use-directory";

type Tab = "residents" | "carsheds";

const TABS: { id: Tab; label: string }[] = [
  { id: "residents", label: "Residents" },
  { id: "carsheds", label: "Carsheds" },
];

export interface Membership {
  circle: Circle;
  position: string | null;
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Each circle's icon as a small badge, labelled with the circle and the resident's role in it. */
export function CircleBadges({ memberships }: { memberships: Membership[] }) {
  if (!memberships.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {memberships.map(({ circle, position }) => {
        const label = `${circle.name} — ${sentence(position ?? "Member")}`;
        return (
          <Link
            key={circle.id}
            href={`/circles/${circle.id}`}
            title={label}
            aria-label={label}
            className="rounded-lg ring-offset-1 hover:ring-2 hover:ring-primary"
          >
            <CircleIcon circle={circle} size={22} />
          </Link>
        );
      })}
    </span>
  );
}

export function digits(value: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function matches(person: Person, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, "");
  return (
    person.displayName.toLowerCase().includes(q) ||
    `${person.lastName} ${person.firstName}`.toLowerCase().includes(q) ||
    (person.email ?? "").includes(q) ||
    unitsOf(person).some((unit) => `unit ${unit}` === q || String(unit) === q) ||
    (qDigits.length >= 3 &&
      (digits(person.phone).includes(qDigits) || digits(person.landline).includes(qDigits)))
  );
}

export function RoleTag({ person }: { person: Person }) {
  return (
    <span className="flex flex-wrap gap-1">
      {person.role !== "household" ? (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium capitalize text-secondary-foreground">
          {person.role}
        </span>
      ) : null}
      {person.resident === false ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
          Not living on site
        </span>
      ) : null}
    </span>
  );
}

/** Each resident's circles, for badges and their page. */
export function membershipsByPerson(circles: Circle[]) {
  const map = new Map<string, Membership[]>();
  for (const circle of circles) {
    for (const seat of circle.seats) {
      if (!seat.personId) continue;
      map.set(seat.personId, [
        ...(map.get(seat.personId) ?? []),
        { circle, position: seat.position },
      ]);
    }
  }
  return map;
}

/** The Board Secretary and admins: add someone to the directory. */
function AddPerson({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    unit: "",
    role: "household",
    phone: "",
    landline: "",
    email: "",
    month: "",
    day: "",
    bio: "",
  });
  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  const add = useMutation({
    mutationFn: () =>
      apiFetch<{ person: Person }>("/api/directory/people", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          birthday: form.month && form.day ? `${form.month} ${form.day}` : "",
          month: undefined,
          day: undefined,
        }),
      }),
    onSuccess: ({ person }) => {
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      toast({
        title: `${person.displayName} added`,
        description:
          person.phone || person.landline
            ? "They can sign in with their phone number."
            : "Add a phone number so they can sign in.",
      });
      onDone();
      router.push(`/directory/${person.id}`);
    },
    onError: (err: Error) =>
      toast({ title: "Could not add", description: err.message, variant: "destructive" }),
  });
  const field = "flex flex-col gap-1 text-sm font-medium text-foreground";
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Add a person</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>
            First name
            <Input
              value={form.firstName}
              maxLength={50}
              onChange={set("firstName")}
              className="bg-white"
              required
            />
          </label>
          <label className={field}>
            Last name
            <Input
              value={form.lastName}
              maxLength={50}
              onChange={set("lastName")}
              className="bg-white"
            />
          </label>
          <label className={field}>
            Unit
            <Input
              type="number"
              min={1}
              max={999}
              value={form.unit}
              onChange={set("unit")}
              className="bg-white"
              required
            />
          </label>
          <label className={field}>
            Role
            <select
              value={form.role}
              onChange={set("role")}
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="owner">Owner</option>
              <option value="renter">Renter</option>
              <option value="household">Household member</option>
            </select>
          </label>
          <label className={field}>
            Mobile phone <span className="text-xs font-normal text-muted">(how they sign in)</span>
            <Input
              type="tel"
              value={form.phone}
              maxLength={40}
              onChange={set("phone")}
              className="bg-white"
            />
          </label>
          <label className={field}>
            Landline
            <Input
              type="tel"
              value={form.landline}
              maxLength={40}
              onChange={set("landline")}
              className="bg-white"
            />
          </label>
          <label className={field}>
            Email
            <Input
              type="email"
              value={form.email}
              maxLength={254}
              onChange={set("email")}
              className="bg-white"
            />
          </label>
          <fieldset className={field}>
            <legend className="mb-1">Birthday</legend>
            <div className="flex gap-2">
              <select
                value={form.month}
                onChange={set("month")}
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                aria-label="Birthday month"
              >
                <option value="">Month</option>
                {MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
              <select
                value={form.day}
                onChange={set("day")}
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                aria-label="Birthday day"
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
        </div>
        <label className={field}>
          About <span className="text-xs font-normal text-muted">(optional)</span>
          <Textarea
            rows={2}
            value={form.bio}
            maxLength={500}
            onChange={set("bio")}
            className="bg-white"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={add.isPending || !form.firstName.trim() || !form.unit}>
            {add.isPending ? "Adding…" : "Add to directory"}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** The directory as a list: each unit, then the people in it. Details (phone, email, birthday) are on each person's page. */
function Residents({ people, circles }: { people: Person[]; circles: Circle[] }) {
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  // People listed as not living on site (e.g. owners who rent their unit out) are hidden unless asked for.
  const [showNonResidents, setShowNonResidents] = useState(false);
  const membershipsOf = useMemo(() => membershipsByPerson(circles), [circles]);
  const nonResidents = people.filter((person) => person.resident === false).length;
  const listed = useMemo(
    () => people.filter((person) => showNonResidents || person.resident !== false),
    [people, showNonResidents]
  );
  const units = useMemo(() => {
    const byUnit = new Map<number, Person[]>();
    // Someone in two households (e.g. a child) is listed under both, with one profile.
    for (const person of listed.filter((p) => matches(p, query))) {
      for (const unit of unitsOf(person)) byUnit.set(unit, [...(byUnit.get(unit) ?? []), person]);
    }
    return Array.from(byUnit.entries())
      .sort(([a], [b]) => a - b)
      .map(
        ([unit, members]) =>
          [unit, members.sort((a, b) => a.displayName.localeCompare(b.displayName))] as const
      );
  }, [listed, query]);
  const shown = new Set(units.flatMap(([, members]) => members.map((person) => person.id))).size;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search by name, unit, email, or phone"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-white pl-9"
            aria-label="Search residents"
          />
        </div>
        {user?.canManageDirectory && !adding ? (
          <Button className="gap-1.5" onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" /> Add a person
          </Button>
        ) : null}
      </div>
      {adding ? <AddPerson onDone={() => setAdding(false)} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-muted">
          {query
            ? `${shown} of ${listed.length} ${showNonResidents ? "people" : "residents"}`
            : `${listed.length} ${showNonResidents ? "people" : "residents"} across ${
                units.length
              } units`}
        </p>
        {nonResidents ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={showNonResidents}
              onChange={(event) => setShowNonResidents(event.target.checked)}
            />
            <span
              aria-hidden
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                showNonResidents ? "bg-primary" : "bg-border"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                  showNonResidents ? "left-[1.125rem]" : "left-0.5"
                )}
              />
            </span>
            Show non-residents <span className="text-muted">({nonResidents})</span>
          </label>
        ) : null}
      </div>
      {units.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {units.map(([unit, members]) => (
              <li
                key={unit}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5"
              >
                <span className="w-20 shrink-0 text-sm font-semibold text-muted sm:pt-1">
                  Unit {unit}
                </span>
                <ul className="flex flex-col gap-2">
                  {members.map((person) => (
                    <li key={person.id} className="flex items-center gap-1.5">
                      <Link
                        href={`/directory/${person.id}`}
                        className="group flex items-center gap-2 rounded-full pr-1 hover:text-foreground"
                      >
                        <Avatar name={person.displayName} photoUrl={person.photoUrl} size={28} />
                        <span className="font-medium text-foreground underline-offset-4 group-hover:underline">
                          {person.displayName}
                        </span>
                        {person.id === user?.personId ? (
                          <span className="text-xs text-muted">(you)</span>
                        ) : null}
                        {person.resident === false ? (
                          <span className="text-xs text-muted">· not living on site</span>
                        ) : null}
                      </Link>
                      <CircleBadges memberships={membershipsOf.get(person.id) ?? []} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">No residents match &ldquo;{query}&rdquo;.</p>
        </Card>
      )}
    </div>
  );
}

function Carsheds({ doc }: { doc: DirectoryDocument }) {
  const byId = new Map(doc.people.map((person) => [person.id, person]));
  const rows = (["northern", "western"] as const).map((row) => ({
    row,
    slots: doc.carsheds.filter((slot) => slot.row === row),
  }));
  const updated = doc.source.carshedsLastUpdated
    ? new Date(`${doc.source.carshedsLastUpdated}T00:00:00`).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col gap-4">
      {updated ? <p className="text-sm text-muted">Allocations last updated {updated}.</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(({ row, slots }) => (
          <Card key={row} className="flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold capitalize text-foreground">
              <Car className="h-5 w-5 text-primary" /> {row} car sheds
            </h2>
            <p className="text-xs text-muted">Listed left to right.</p>
            <ul className="divide-y divide-border">
              {slots.map((slot) => (
                <li
                  key={slot.slot}
                  className="flex items-baseline justify-between gap-3 py-2 text-sm"
                >
                  <span className="text-muted">Shed {slot.slot}</span>
                  <span className="text-right text-foreground">
                    {slot.occupants
                      .map(
                        (occupant) =>
                          (occupant.personId && byId.get(occupant.personId)?.displayName) ||
                          occupant.name
                      )
                      .join(" & ")}
                    <span className="ml-1.5 text-xs text-muted">Unit {slot.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DirectoryClient() {
  const [tab, setTab] = useState<Tab>("residents");
  const { data, isLoading, error } = useDirectoryQuery();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <SectionArt href="/directory" size={48} />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Directory</h1>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Directory sections"
        className="flex w-fit gap-1 rounded-full border border-border bg-surface p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition",
              tab === item.id
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-foreground/70 hover:bg-accent"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading the directory…</p>
      ) : error || !data ? (
        <Card>
          <p className="text-sm text-foreground">
            {(error as Error | null)?.message ?? "The directory is unavailable."}
          </p>
        </Card>
      ) : tab === "residents" ? (
        <Residents people={data.people} circles={data.circles} />
      ) : (
        <Carsheds doc={data} />
      )}
    </div>
  );
}
