/** Shared helpers for search: counting matches and quoting the passage around one. */

/** How often `term` appears in `haystack` (counting stops at 50). */
export const occurrences = (haystack: string, term: string) => {
  let count = 0;
  for (let at = haystack.indexOf(term); at !== -1 && count < 50; at = haystack.indexOf(term, at + term.length)) count++;
  return count;
};

/** A short passage of `text` around the earliest match of any term. */
export function snippetFor(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  if (at === -1) return null;
  const start = Math.max(0, at - 90);
  const end = Math.min(text.length, at + 160);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

/** Split a search into terms; "quoted phrases" stay together. */
export function searchTerms(query: string) {
  const terms: string[] = [];
  for (const match of query.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (match[1] ?? match[2]).trim();
    if (term) terms.push(term);
  }
  return terms.slice(0, 10);
}
