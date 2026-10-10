/**
 * Site administrators, by directory person id (stable across name edits).
 * Admins can do anything any resident can, on anyone's content: manage and
 * delete any circle, edit or delete any forum post or appreciation, remove
 * any skill or library item, and edit any profile (including the email
 * address a resident's sign-in links go to).
 *
 * They come from three places: built in (below), ADMIN_PERSON_IDS in Vercel
 * (comma-separated person ids), and those added on the Admin settings page
 * (`admin-store.ts`). The added ones are read into memory as each request's
 * session is read (`loadAdmins`), so `isAdmin` stays a plain check.
 */
const BUILT_IN_ADMINS = [
  "be72c119ec56", // Sam Peret, Unit 23
];

/** Admins added on the Admin settings page, as last read (`admin-store.ts`). */
let added = new Set<string>();

export function setAddedAdmins(personIds: Iterable<string>) {
  added = new Set(personIds);
}

export const builtInAdmins = () => new Set(BUILT_IN_ADMINS);

/** Those set in Vercel (ADMIN_PERSON_IDS). */
export function environmentAdmins(): Set<string> {
  return new Set(
    (process.env.ADMIN_PERSON_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function adminPersonIds(): Set<string> {
  return new Set([...BUILT_IN_ADMINS, ...Array.from(environmentAdmins()), ...Array.from(added)]);
}

export function isAdmin(user: { personId?: string | null } | null | undefined): boolean {
  return !!user?.personId && adminPersonIds().has(user.personId);
}
