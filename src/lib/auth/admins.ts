/**
 * Site administrators, by directory person id (stable across name edits).
 * Admins can do anything any resident can, on anyone's content: manage and
 * delete any circle, edit or delete any forum post or appreciation, remove
 * any skill or library item, and edit any profile (including resetting a
 * resident's phone number, which is their password).
 *
 * More admins can be added without a code change via ADMIN_PERSON_IDS
 * (comma-separated person ids).
 */
const BUILT_IN_ADMINS = [
  "be72c119ec56", // Sam Peret, Unit 23
];

export function adminPersonIds(): Set<string> {
  const extra = (process.env.ADMIN_PERSON_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return new Set([...BUILT_IN_ADMINS, ...extra]);
}

export function isAdmin(user: { personId?: string | null } | null | undefined): boolean {
  return !!user?.personId && adminPersonIds().has(user.personId);
}
