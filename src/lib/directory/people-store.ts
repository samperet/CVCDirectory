import { randomBytes } from "crypto";
import { enqueue, readJson, writeJson } from "@/lib/storage";
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
}

export async function readPeopleChanges(): Promise<PeopleChanges> {
  const raw = (await readJson(KEY)) as Partial<PeopleChanges> | null;
  return { added: Array.isArray(raw?.added) ? raw!.added : [], removed: Array.isArray(raw?.removed) ? raw!.removed : [] };
}

/** The imported people, less those removed, plus those added. */
export function applyPeopleChanges(imported: Person[], changes: PeopleChanges): Person[] {
  const removed = new Set(changes.removed);
  return [...imported.filter((person) => !removed.has(person.id)), ...changes.added.filter((person) => !removed.has(person.id))];
}

/** A new directory id, in the same 12-hex-character form as imported ones. */
export const newPersonId = () => randomBytes(6).toString("hex");

export async function addPerson(person: Person) {
  await enqueue(KEY, async () => {
    const changes = await readPeopleChanges();
    await writeJson(KEY, { ...changes, added: [...changes.added, person] });
  });
}

export async function removePerson(personId: string) {
  await enqueue(KEY, async () => {
    const changes = await readPeopleChanges();
    await writeJson(KEY, {
      added: changes.added.filter((person) => person.id !== personId),
      removed: changes.removed.includes(personId) ? changes.removed : [...changes.removed, personId],
    });
  });
}
