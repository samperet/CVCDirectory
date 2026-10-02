import { randomBytes } from "crypto";
import { mutateJson, readJson } from "@/lib/storage";
import type { Person } from "./types";

/**
 * People added to or removed from the directory in the app, kept apart from
 * the imported spreadsheet (like residents' profile edits) so a re-import
 * never undoes them: removed residents stay removed, added ones stay added.
 */

const KEY = "directory/people.json";

export interface PeopleChanges {
  added: Person[];
  removed: string[];
  /** Entries a directory manager combined: duplicate's id → the profile to keep. */
  merges: Record<string, string>;
  /** Entries that share a name but are different people, so aren't combined automatically. */
  separate: string[];
}

function normalize(value: unknown): PeopleChanges {
  const raw = value as Partial<PeopleChanges> | null;
  return {
    added: Array.isArray(raw?.added) ? raw!.added : [],
    removed: Array.isArray(raw?.removed) ? raw!.removed : [],
    merges: raw?.merges && typeof raw.merges === "object" ? raw.merges : {},
    separate: Array.isArray(raw?.separate) ? raw!.separate : [],
  };
}

export async function readPeopleChanges(): Promise<PeopleChanges> {
  return normalize(await readJson(KEY));
}

async function change(update: (changes: PeopleChanges) => PeopleChanges) {
  await mutateJson(KEY, (raw) => ({ value: update(normalize(raw)), result: null }));
}

/** Combine a duplicate entry into another person's profile. */
export function mergePeople(duplicateId: string, keepId: string) {
  return change((changes) => ({
    ...changes,
    merges: { ...changes.merges, [duplicateId]: keepId },
    separate: changes.separate.filter((id) => id !== duplicateId && id !== keepId),
  }));
}

/** Split a combined profile back into its separate entries (and never combine them automatically again). */
export function separatePeople(ids: string[]) {
  const set = new Set(ids);
  return change((changes) => ({
    ...changes,
    merges: Object.fromEntries(
      Object.entries(changes.merges).filter(([from, to]) => !(set.has(from) && set.has(to)))
    ),
    separate: Array.from(new Set([...changes.separate, ...ids])),
  }));
}

/** The imported people, less those removed, plus those added. */
export function applyPeopleChanges(imported: Person[], changes: PeopleChanges): Person[] {
  const removed = new Set(changes.removed);
  return [
    ...imported.filter((person) => !removed.has(person.id)),
    ...changes.added.filter((person) => !removed.has(person.id)),
  ];
}

/** A new directory id, in the same 12-hex-character form as imported ones. */
export const newPersonId = () => randomBytes(6).toString("hex");

export function addPerson(person: Person) {
  return change((changes) => ({ ...changes, added: [...changes.added, person] }));
}

export function removePerson(personId: string) {
  return change((changes) => ({
    ...changes,
    added: changes.added.filter((person) => person.id !== personId),
    removed: changes.removed.includes(personId) ? changes.removed : [...changes.removed, personId],
  }));
}
