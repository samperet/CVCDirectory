import { removeUsersForPerson } from "@/lib/auth/users";
import { removePersonFromCircles } from "@/lib/circles/store";
import { deleteProfile, photoKey, updateProfile } from "@/lib/profiles/store";
import { removeUserPush } from "@/lib/push/store";
import { deleteBinary } from "@/lib/storage";
import { removePerson } from "./people-store";
import { unitsOf } from "./households";
import type { Circle, DirectoryDocument, Person } from "./types";

/**
 * Directory changes shared by the directory managers' pages and the admin
 * API: removing someone, taking them out of one of their units, and marking
 * whether they live on site.
 */

/** The directory entries that make up a profile (more than one when it's listed in several households). */
export function entriesOf(directory: DirectoryDocument, personId: string) {
  return [personId, ...Object.entries(directory.aliases ?? {}).filter(([, to]) => to === personId).map(([from]) => from)];
}

/** Find a profile by its id or any of its entries' ids. */
export function findPerson(directory: DirectoryDocument, id: string): Person | null {
  const resolved = directory.aliases?.[id] ?? id;
  return directory.people.find((person) => person.id === resolved) ?? null;
}

/** Remove a single directory entry and everything that hangs off it. */
async function removeEntry(entryId: string, importedCircles: Circle[]) {
  await removePerson(entryId);
  await removePersonFromCircles(importedCircles, entryId);
  await removeUserPush(await removeUsersForPerson(entryId));
  if (await deleteProfile(entryId)) await deleteBinary(photoKey(entryId));
}

/**
 * Remove someone from the directory: every entry of their profile. They
 * leave every circle, their account closes (ending any session, so they
 * can't sign in), and their profile, photo, and notifications go too. What
 * they posted stays, under their name.
 */
export async function removeFromDirectory(directory: DirectoryDocument, importedCircles: Circle[], person: Person) {
  for (const entry of entriesOf(directory, person.id)) await removeEntry(entry, importedCircles);
}

/**
 * Take someone out of one of the units they're listed in, keeping their
 * profile (and its id) in the others.
 */
export async function leaveUnit(
  directory: DirectoryDocument,
  importedEntries: Person[],
  person: Person,
  unit: number
): Promise<"left" | "not_listed" | "only_unit"> {
  const units = unitsOf(person);
  if (!units.includes(unit)) return "not_listed";
  if (units.length < 2) return "only_unit";
  const entries = entriesOf(directory, person.id);
  // Where each entry was listed originally (the profile's own unit may have been edited).
  const originalUnit = new Map(importedEntries.filter((entry) => entries.includes(entry.id)).map((entry) => [entry.id, entry.unit]));
  const leaving = entries.find((id) => id !== person.id && originalUnit.get(id) === unit);
  if (leaving) {
    await removeEntry(leaving, []);
    return "left";
  }
  // The unit to leave is the profile's own: move the profile to one of its other units, dropping that unit's entry.
  const [stay] = units.filter((entry) => entry !== unit);
  const other = entries.find((id) => id !== person.id && originalUnit.get(id) === stay);
  await updateProfile(person.id, { unit: stay });
  if (other) await removeEntry(other, []);
  return "left";
}

/** Mark whether someone lives on site (on every entry, since a combined profile lives on site if any entry does). */
export async function setResident(directory: DirectoryDocument, person: Person, resident: boolean) {
  for (const entry of entriesOf(directory, person.id)) await updateProfile(entry, { resident });
}
