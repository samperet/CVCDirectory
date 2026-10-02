/** Small helpers for text shown in the app (safe for the browser). */

/** "op leader" → "Op leader". */
export const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "AA" for "Ada Ash" — first and last initials, ignoring anything in brackets; "?" with no name. */
export function initials(name: string) {
  const parts = name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() ||
    "?"
  );
}

/** "Ada, Ben and Cara"; past three, "Ada, Ben and 3 others". */
export function listNames(names: string[]) {
  if (names.length <= 3) return names.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/** "Liked by You, Ben and 3 others" — for a like button's tooltip. */
export function likedByLabel(
  likes: { userId: string; name: string }[],
  currentUserId: string | null
) {
  const names = likes.map((like) => (like.userId === currentUserId ? "You" : like.name));
  names.sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : 0));
  return `Liked by ${listNames(names)}`;
}
