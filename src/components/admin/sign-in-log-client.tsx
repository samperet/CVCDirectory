"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { SignInEntry } from "@/lib/auth/sign-in-log";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loading, ErrorCard } from "@/components/ui/status";
import { SegmentedControl } from "@/components/ui/segmented";
import { timeAgo } from "@/lib/time";

/**
 * The admins' sign-in log: every sign-in, by day — or **By resident**, each
 * resident with when they were last seen in the app (noted while they have
 * it open; "Never" if not since it began being noted), how often they've
 * signed in, and when they last did. Sorted by last seen, or by name.
 */

type View = "all" | "people";
type Sort = "seen" | "name";
type LogData = {
  entries: SignInEntry[];
  lastSeen: Record<string, string>;
  people: { personId: string; name: string }[];
};
const DAY_MS = 24 * 60 * 60 * 1000;

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

const time = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const shortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
  ", " +
  time(date);

export function SignInLogClient() {
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<Sort>("seen");
  const [query, setQuery] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "sign-ins"],
    queryFn: () => apiFetch<LogData>("/api/admin/sign-ins"),
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

  // Every resident (and anyone with sign-ins who's since left), with when they were last seen.
  const byPerson = useMemo(() => {
    const q = query.trim().toLowerCase();
    const people = new Map<
      string,
      { personId: string; name: string; count: number; last: string | null; seen: string | null }
    >();
    const row = (personId: string, name: string) => {
      const existing = people.get(personId);
      if (existing) return existing;
      const made = { personId, name, count: 0, last: null, seen: data?.lastSeen[personId] ?? null };
      people.set(personId, made);
      return made;
    };
    for (const person of data?.people ?? []) row(person.personId, person.name);
    for (const entry of data?.entries ?? []) {
      const person = row(entry.personId, entry.name);
      person.count += 1;
      person.last ??= entry.at; // entries are newest first
    }
    return Array.from(people.values())
      .filter((person) => !q || person.name.toLowerCase().includes(q))
      .sort((a, b) =>
        sort === "seen" && (a.seen ?? "") !== (b.seen ?? "")
          ? (b.seen ?? "").localeCompare(a.seen ?? "")
          : a.name.localeCompare(b.name)
      );
  }, [data, query, sort]);

  const signIns = data?.entries ?? [];
  const total = signIns.length;
  const residents = new Set(signIns.map((entry) => entry.personId)).size;
  const now = Date.now();
  const seenThisWeek = Object.values(data?.lastSeen ?? {}).filter(
    (at) => now - Date.parse(at) < 7 * DAY_MS
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sign-in log</h1>
        {total ? (
          <p className="text-sm text-muted">
            {total} sign-in{total === 1 ? "" : "s"} by {residents} resident
            {residents === 1 ? "" : "s"} · {seenThisWeek} seen in the app this week
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          role="tablist"
          label="Sign-ins"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All sign-ins" },
            { value: "people", label: "By resident" },
          ]}
        />
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
        <Loading />
      ) : error ? (
        <ErrorCard error={error} />
      ) : view === "all" && !entries.length ? (
        <Card>
          <p className="text-sm text-muted">
            {query ? `No sign-ins match “${query}”.` : "No sign-ins recorded yet."}
          </p>
        </Card>
      ) : view === "all" ? (
        byDay.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </h2>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {group.entries.map((entry, index) => (
                  <li
                    key={`${entry.at}-${index}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
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
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Last seen: when they last had the app open (to within ten minutes).
            </p>
            <SegmentedControl
              size="sm"
              label="Sort by"
              value={sort}
              onChange={setSort}
              options={[
                { value: "seen", label: "Last seen" },
                { value: "name", label: "Name" },
              ]}
            />
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm" data-residents>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-semibold">Resident</th>
                  <th className="px-3 py-3 font-semibold">Last seen</th>
                  <th className="px-3 py-3 text-right font-semibold">Sign-ins</th>
                  <th className="px-5 py-3 font-semibold">Last signed in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byPerson.map((person) => (
                  <tr key={person.personId} data-resident={person.personId}>
                    <td className="px-5 py-3 font-medium text-foreground">{person.name}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-foreground-light">
                      {person.seen ? (
                        <time dateTime={person.seen} title={shortDate(new Date(person.seen))}>
                          {timeAgo(person.seen)}
                        </time>
                      ) : (
                        <span className="text-muted">Never</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-foreground-light">
                      {person.count}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted">
                      {person.last ? (
                        <time dateTime={person.last}>{shortDate(new Date(person.last))}</time>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
