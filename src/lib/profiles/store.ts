import { enqueue, readJson, writeJson } from "@/lib/storage";
import type { Person } from "@/lib/directory/types";

/**
 * Residents' own edits to their directory entry, kept apart from the imported
 * spreadsheet so a re-import never wipes them. Only fields present in an
 * override replace the imported value (null clears it). Photos are stored as
 * separate binary objects; the override records that one exists.
 */

export interface ProfileOverride {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  landline?: string | null;
  birthday?: string | null;
  bio?: string | null;
  photo?: { contentType: string; updatedAt: string } | null;
  updatedAt: string;
}

const KEY = "profiles/index.json";

/** Directory person ids are 12 hex characters; they become storage keys, so nothing else is accepted. */
export function isPersonId(id: string) {
  return /^[a-f0-9]{12}$/.test(id);
}

export function photoKey(personId: string) {
  if (!isPersonId(personId)) throw new Error("Invalid person id");
  return `profiles/photos/${personId}`;
}

export async function readProfiles(): Promise<Record<string, ProfileOverride>> {
  const raw = (await readJson(KEY)) as { profiles?: Record<string, ProfileOverride> } | null;
  return raw?.profiles && typeof raw.profiles === "object" ? raw.profiles : {};
}

export async function updateProfile(
  personId: string,
  patch: Omit<Partial<ProfileOverride>, "updatedAt">
): Promise<ProfileOverride> {
  return enqueue(KEY, async () => {
    const profiles = await readProfiles();
    const next: ProfileOverride = { ...profiles[personId], ...patch, updatedAt: new Date().toISOString() };
    await writeJson(KEY, { profiles: { ...profiles, [personId]: next } });
    return next;
  });
}

function has<K extends keyof ProfileOverride>(override: ProfileOverride, key: K) {
  return Object.prototype.hasOwnProperty.call(override, key);
}

/** A directory entry with the resident's own edits and photo applied. */
export function applyProfile(person: Person, override: ProfileOverride | undefined): Person {
  if (!override) return { ...person, bio: null, photoUrl: null };
  const firstName = has(override, "firstName") ? override.firstName! : person.firstName;
  const lastName = has(override, "lastName") ? override.lastName! : person.lastName;
  return {
    ...person,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`.trim(),
    email: has(override, "email") ? override.email ?? null : person.email,
    phone: has(override, "phone") ? override.phone ?? null : person.phone,
    landline: has(override, "landline") ? override.landline ?? null : person.landline,
    birthday: has(override, "birthday") ? override.birthday ?? null : person.birthday,
    bio: override.bio ?? null,
    photoUrl: override.photo ? `/api/profiles/${person.id}/photo?v=${encodeURIComponent(override.photo.updatedAt)}` : null,
  };
}
