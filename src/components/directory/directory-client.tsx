"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cake, Car, Home, Mail, Phone, Search, Users2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle, DirectoryDocument, Person } from "@/lib/directory/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "residents" | "circles" | "carsheds";

const TABS: { id: Tab; label: string }[] = [
  { id: "residents", label: "Residents" },
  { id: "circles", label: "Circles" },
  { id: "carsheds", label: "Carsheds" },
];

function digits(value: string | null) {
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
    `unit ${person.unit}` === q ||
    String(person.unit) === q ||
    (qDigits.length >= 3 && (digits(person.phone).includes(qDigits) || digits(person.landline).includes(qDigits)))
  );
}

function RoleTag({ person }: { person: Person }) {
  return (
    <span className="flex flex-wrap gap-1">
      {person.role !== "household" ? (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium capitalize text-secondary-foreground">
          {person.role}
        </span>
      ) : null}
      {person.resident === false ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">Not living on site</span>
      ) : null}
    </span>
  );
}

function PersonRow({ person }: { person: Person }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{person.displayName}</span>
        <RoleTag person={person} />
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        {person.phone ? (
          <a href={`tel:${digits(person.phone)}`} className="inline-flex w-fit items-center gap-1.5 text-foreground-light hover:underline">
            <Phone className="h-3.5 w-3.5 text-muted" /> {person.phone}
          </a>
        ) : null}
        {person.landline ? (
          <a href={`tel:${digits(person.landline)}`} className="inline-flex w-fit items-center gap-1.5 text-foreground-light hover:underline">
            <Home className="h-3.5 w-3.5 text-muted" /> {person.landline} <span className="text-muted">(landline)</span>
          </a>
        ) : null}
        {person.email ? (
          <a href={`mailto:${person.email}`} className="inline-flex w-fit items-center gap-1.5 break-all text-foreground-light hover:underline">
            <Mail className="h-3.5 w-3.5 shrink-0 text-muted" /> {person.email}
          </a>
        ) : null}
        {person.birthday ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Cake className="h-3.5 w-3.5" /> {person.birthday}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function Residents({ people }: { people: Person[] }) {
  const [query, setQuery] = useState("");
  const units = useMemo(() => {
    const byUnit = new Map<number, Person[]>();
    for (const person of people.filter((p) => matches(p, query))) {
      byUnit.set(person.unit, [...(byUnit.get(person.unit) ?? []), person]);
    }
    return Array.from(byUnit.entries()).sort(([a], [b]) => a - b);
  }, [people, query]);
  const shown = units.reduce((total, [, members]) => total + members.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative md:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          placeholder="Search by name, unit, email, or phone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="bg-white pl-9"
          aria-label="Search residents"
        />
      </div>
      <p className="text-sm text-muted">
        {query ? `${shown} of ${people.length} residents` : `${people.length} residents across ${units.length} units`}
      </p>
      {units.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {units.map(([unit, members]) => (
            <Card key={unit} className="flex flex-col gap-3 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Unit {unit}</h2>
              <ul className="divide-y divide-border">
                {members.map((person) => (
                  <PersonRow key={person.id} person={person} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-muted">No residents match &ldquo;{query}&rdquo;.</p>
        </Card>
      )}
    </div>
  );
}

function Circles({ circles, people }: { circles: Circle[]; people: Person[] }) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {circles.map((circle) => {
        const filled = circle.seats.filter((seat) => seat.name);
        const open = circle.seats.length - filled.length;
        return (
          <Card key={circle.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {circle.name}
                {circle.name !== circle.code ? <span className="ml-2 text-sm font-normal text-muted">{circle.code}</span> : null}
              </h2>
              <span className="text-xs text-muted">
                {filled.length} of {circle.seats.length} seats filled
              </span>
            </div>
            {filled.length ? (
              <ul className="flex flex-col gap-2">
                {filled.map((seat, index) => (
                  <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="text-foreground">
                      {(seat.personId && byId.get(seat.personId)?.displayName) ?? seat.name}
                      {seat.personId && byId.has(seat.personId) ? (
                        <span className="ml-1.5 text-xs text-muted">Unit {byId.get(seat.personId)!.unit}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted">
                      {sentence(seat.position ?? "Member")}
                      {seat.termEnds ? ` · term ends ${seat.termEnds}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No members listed yet.</p>
            )}
            {open ? (
              <p className="rounded-lg bg-accent/60 px-3 py-2 text-xs text-foreground-light">
                {open} open seat{open === 1 ? "" : "s"} — interested? Reach out to the circle.
              </p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function Carsheds({ doc }: { doc: DirectoryDocument }) {
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
                <li key={slot.slot} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="text-muted">Shed {slot.slot}</span>
                  <span className="text-right text-foreground">
                    {slot.occupants.map((occupant) => occupant.name).join(" & ")}
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["directory"],
    queryFn: () => apiFetch<DirectoryDocument>("/api/directory"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Users2 className="h-6 w-6 text-primary" /> Directory
        </h1>
        <p className="text-sm text-muted">Neighbors, circles, and carshed allocations. For residents only — please keep it private.</p>
      </div>

      <div role="tablist" aria-label="Directory sections" className="flex w-fit gap-1 rounded-full border border-border bg-surface p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition",
              tab === item.id ? "bg-primary text-primary-foreground shadow-soft" : "text-foreground/70 hover:bg-accent"
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
          <p className="text-sm text-foreground">{(error as Error | null)?.message ?? "The directory is unavailable."}</p>
        </Card>
      ) : tab === "residents" ? (
        <Residents people={data.people} />
      ) : tab === "circles" ? (
        <Circles circles={data.circles} people={data.people} />
      ) : (
        <Carsheds doc={data} />
      )}
    </div>
  );
}
