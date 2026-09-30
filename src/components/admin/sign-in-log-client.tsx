"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { SignInEntry } from "@/lib/auth/sign-in-log";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type View = "all" | "people";

const dayKey = (date: Date) => date.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

const time = (date: Date) => date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const shortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + ", " + time(date);

export function SignInLogClient() {
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "sign-ins"],
    queryFn: () => apiFetch<{ entries: SignInEntry[] }>("/api/admin/sign-ins"),
    refetchInterval: 60_000,
  });

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.entries ?? []).filter((entry) => !q || entry.name.toLowerCase().includes(q));
  }, [data, query]);

  const byDay = useMemo(() => {
    const groups: { key: string; label: string; entries: SignInEntry[] }[] = [];
    for (const entry of entries) {
      const date = new Date(entry.at);
      const key = dayKey(date);
      if (groups.at(-1)?.key !== key) groups.push({ key, label: dayLabel(date), entries: [] });
      groups.at(-1)!.entries.push(entry);
    }
    return groups;
  }, [entries]);

  const byPerson = useMemo(() => {
    const people = new Map<string, { name: string; count: number; last: string; first: string }>();
    for (const entry of entries) {
      const existing = people.get(entry.personId);
      if (existing) {
        existing.count += 1;
        existing.first = entry.at; // entries are newest first
      } else {
        people.set(entry.personId, { name: entry.name, count: 1, last: entry.at, first: entry.at });
      }
    }
    return Array.from(people.values());
  }, [entries]);

  const signIns = data?.entries ?? [];
  const total = signIns.length;
  const residents = new Set(signIns.map((entry) => entry.personId)).size;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sign-in log</h1>
        {total ? (
          <p className="text-sm text-muted">
            {total} sign-in{total === 1 ? "" : "s"} by {residents} resident{residents === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-full border border-border bg-surface p-1" role="tablist">
          {(
            [
              ["all", "All sign-ins"],
              ["people", "By resident"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                view === value ? "bg-primary text-primary-foreground shadow-soft" : "text-foreground/70 hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Filter by name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-white pl-9"
            aria-label="Filter by name"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <Card>
          <p className="text-sm text-foreground">{(error as Error).message}</p>
        </Card>
      ) : !entries.length ? (
        <Card>
          <p className="text-sm text-muted">{query ? `No sign-ins match “${query}”.` : "No sign-ins recorded yet."}</p>
        </Card>
      ) : view === "all" ? (
        byDay.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{group.label}</h2>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {group.entries.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="font-medium text-foreground">{entry.name}</span>
                    <time dateTime={entry.at} className="shrink-0 tabular-nums text-muted">
                      {time(new Date(entry.at))}
                    </time>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-semibold">Resident</th>
                <th className="px-3 py-3 text-right font-semibold">Sign-ins</th>
                <th className="px-5 py-3 font-semibold">Last signed in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byPerson.map((person) => (
                <tr key={person.name + person.first}>
                  <td className="px-5 py-3 font-medium text-foreground">{person.name}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground-light">{person.count}</td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted">
                    <time dateTime={person.last}>{shortDate(new Date(person.last))}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
