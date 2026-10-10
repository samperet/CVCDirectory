import { mutateJson, readJson } from "@/lib/storage";
import type { Actor } from "./actor";
import { builtInAdmins, environmentAdmins, setAddedAdmins } from "./admins";

/**
 * The admins added on the Admin settings page (`auth/admins.json`), beside
 * those built in and those set in Vercel (ADMIN_PERSON_IDS), which can't be
 * changed there. Any admin adds or removes them; there's always at least one
 * admin. They're read into memory as each request's session is read
 * (`loadAdmins`, at most every few seconds per server), so `isAdmin` knows
 * them everywhere.
 */

const KEY = "auth/admins.json";
const REFRESH_MS = 5_000;

export interface AddedAdmin {
  personId: string;
  addedAt: string;
  addedBy: { userId: string; name: string };
}

/** Where an admin comes from: built in, set in Vercel, or added in the app. */
export type AdminSource = "built-in" | "environment" | "added";

export interface AdminEntry {
  personId: string;
  source: AdminSource;
  addedAt?: string;
  addedBy?: { name: string };
}

export type Failure = "already" | "not_added" | "fixed" | "last";
export type AdminResult = { ok: true; admins: AdminEntry[] } | { ok: false; reason: Failure };

function normalize(raw: unknown): AddedAdmin[] {
  const list = (raw as { admins?: unknown } | null)?.admins;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (entry): entry is AddedAdmin =>
      !!entry &&
      typeof (entry as AddedAdmin).personId === "string" &&
      typeof (entry as AddedAdmin).addedAt === "string"
  );
}

let loadedAt = 0;
let loading: Promise<void> | null = null;

function remember(list: AddedAdmin[]) {
  setAddedAdmins(list.map((entry) => entry.personId));
  loadedAt = Date.now();
}

/** Read the added admins into memory, unless they were read a moment ago. */
export async function loadAdmins(): Promise<void> {
  if (Date.now() - loadedAt < REFRESH_MS) return;
  loading ??= readJson(KEY)
    .then((raw) => remember(normalize(raw)))
    // Unreadable just now: keep what was known.
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  await loading;
}

/** Everyone who's an admin, and how: built in, then set in Vercel, then added (oldest first). */
function entriesOf(list: AddedAdmin[]): AdminEntry[] {
  const builtIn = builtInAdmins();
  const environment = environmentAdmins();
  const seen = new Set<string>();
  const entries: AdminEntry[] = [];
  const add = (entry: AdminEntry) => {
    if (seen.has(entry.personId)) return;
    seen.add(entry.personId);
    entries.push(entry);
  };
  builtIn.forEach((personId) => add({ personId, source: "built-in" }));
  environment.forEach((personId) => add({ personId, source: "environment" }));
  for (const entry of list)
    add({
      personId: entry.personId,
      source: "added",
      addedAt: entry.addedAt,
      addedBy: { name: entry.addedBy.name },
    });
  return entries;
}

export async function listAdmins(): Promise<AdminEntry[]> {
  const list = normalize(await readJson(KEY));
  remember(list);
  return entriesOf(list);
}

const isFixed = (personId: string) =>
  builtInAdmins().has(personId) || environmentAdmins().has(personId);

/** Change the added admins; once saved, they're known here at once. */
async function change(
  decide: (list: AddedAdmin[]) => AddedAdmin[] | Failure
): Promise<AdminResult> {
  const result = await mutateJson<{ list: AddedAdmin[] } | { reason: Failure }>(KEY, (raw) => {
    const next = decide(normalize(raw));
    return typeof next === "string"
      ? { write: false, result: { reason: next } }
      : { value: { admins: next }, result: { list: next } };
  });
  if ("reason" in result) return { ok: false, reason: result.reason };
  remember(result.list);
  return { ok: true, admins: entriesOf(result.list) };
}

/** Make a resident an admin. */
export function addAdmin(personId: string, by: Pick<Actor, "userId" | "name">) {
  return change((list) =>
    isFixed(personId) || list.some((entry) => entry.personId === personId)
      ? "already"
      : [
          ...list,
          {
            personId,
            addedAt: new Date().toISOString(),
            addedBy: { userId: by.userId, name: by.name },
          },
        ]
  );
}

/** Stop a resident being an admin: only one added here, and never the last admin. */
export function removeAdmin(personId: string) {
  return change((list) => {
    if (isFixed(personId)) return "fixed";
    if (!list.some((entry) => entry.personId === personId)) return "not_added";
    const next = list.filter((entry) => entry.personId !== personId);
    return entriesOf(next).length ? next : "last";
  });
}
