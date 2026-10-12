/**
 * Find and replace in the editor (safe for the browser): where a word or
 * phrase appears in a block's text — as typed, any letter case unless
 * **Match case** is on — without overlaps, left to right. The editor's
 * plugin (`components/wiki/editor-find.ts`) runs it over each paragraph,
 * heading, list item and table cell.
 */

/** At most this many matches are shown (and replaced at once). */
export const MAX_MATCHES = 1000;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where `query` appears in `text`, as [start, end) pairs. */
export function matchesIn(text: string, query: string, caseSensitive: boolean): [number, number][] {
  if (!query) return [];
  const pattern = new RegExp(escape(query), caseSensitive ? "g" : "gi");
  const found: [number, number][] = [];
  for (const match of Array.from(text.matchAll(pattern))) {
    found.push([match.index!, match.index! + match[0].length]);
    if (found.length >= MAX_MATCHES) break;
  }
  return found;
}
