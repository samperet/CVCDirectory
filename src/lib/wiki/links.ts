/**
 * Links in wiki pages, written in double brackets:
 *
 * - `[[Page title]]` — a page in the same circle's wiki;
 * - `[[O&M:Page title]]` — a page in another circle's wiki (by the circle's name);
 * - `[[doc:Document title]]` — a document, by its title (this circle's first,
 *   then any circle's), or `[[doc:O&M:Document title]]` for one circle's;
 *
 * each optionally followed by `|shown text`. This is shared by the server
 * (what links to a page) and the browser (showing and inserting links).
 */

/**
 * The visual editor writes the brackets escaped (`\[\[Page title\]\]`), and
 * sometimes characters inside them (`O\&M`); this puts them back so pages
 * keep readable links.
 */
export const normalizeWikiLinks = (markdown: string) =>
  markdown.replace(/\\?\[\\?\[((?:\\[^[\]\n]|[^\]\n\\]){1,240})\\?\]\\?\]/g, (_match, inner: string) => `[[${inner.replace(/\\([!-/:-@[-`{-~])/g, "$1")}]]`);

/**
 * Ready for the visual editor: colons inside links escaped, so "[[O&M:Water]]"
 * isn't read as a `:Water` directive (outside code blocks). Saving undoes
 * it, as `normalizeWikiLinks` does.
 */
export function protectWikiLinks(markdown: string) {
  let inCode = false;
  return normalizeWikiLinks(markdown)
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
      return inCode ? line : line.replace(/\[\[[^\]\n]{1,360}\]\]/g, (link) => link.replace(/:/g, "\\:"));
    })
    .join("\n");
}

/** A link, once normalized: `[[target]]` or `[[target|label]]`. */
export const WIKI_LINK = /\[\[([^\]|\n]{1,240})(?:\|([^\]\n]{1,120}))?\]\]/g;

export interface CircleRef {
  id: string;
  name: string;
  code?: string;
}

export type WikiLinkTarget = { kind: "page"; circleId: string; title: string } | { kind: "doc"; circleId: string | null; title: string };

/** The circle a link's prefix names — by name, short code, or id — if any. */
export function circleNamed(prefix: string, circles: CircleRef[]) {
  const wanted = prefix.trim().toLowerCase();
  if (!wanted) return undefined;
  return circles.find((circle) => circle.name.toLowerCase() === wanted || circle.id.toLowerCase() === wanted || circle.code?.toLowerCase() === wanted);
}

/** Split "O&M:Pellet Stove" into its circle and the rest, when the part before the colon names a circle. */
function splitCircle(text: string, circles: CircleRef[]): { circle?: CircleRef; rest: string } {
  const colon = text.indexOf(":");
  if (colon > 0) {
    const circle = circleNamed(text.slice(0, colon), circles);
    if (circle && text.slice(colon + 1).trim()) return { circle, rest: text.slice(colon + 1).trim() };
  }
  return { rest: text.trim() };
}

/** What a link's target (the part before any `|`) points to, from a page in `circleId`'s wiki. */
export function parseWikiLink(target: string, circleId: string, circles: CircleRef[]): WikiLinkTarget {
  const doc = target.match(/^\s*doc\s*:(.+)$/i);
  if (doc) {
    const { circle, rest } = splitCircle(doc[1], circles);
    return { kind: "doc", circleId: circle?.id ?? null, title: rest };
  }
  const { circle, rest } = splitCircle(target, circles);
  return { kind: "page", circleId: circle?.id ?? circleId, title: rest };
}

/** Every link in a page's Markdown (outside code), with what it points to. */
export function wikiLinksIn(markdown: string, circleId: string, circles: CircleRef[]) {
  const links: (WikiLinkTarget & { label?: string })[] = [];
  const text = normalizeWikiLinks(markdown)
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1/gm, "")
    .replace(/`[^`\n]*`/g, "");
  for (const match of Array.from(text.matchAll(WIKI_LINK))) {
    links.push({ ...parseWikiLink(match[1], circleId, circles), ...(match[2] ? { label: match[2].trim() } : {}) });
  }
  return links;
}

/** The text to insert for a link to a page — with its circle's name when it's another circle's. */
export function pageLinkText(title: string, circle: CircleRef, fromCircleId: string) {
  return circle.id === fromCircleId ? `[[${title}]]` : `[[${circle.name}:${title}]]`;
}

/** The text to insert for a link to a document; `ambiguous` when another circle has a document with the same title. */
export function docLinkText(title: string, circle: CircleRef | undefined, fromCircleId: string, ambiguous: boolean) {
  return circle && ambiguous && circle.id !== fromCircleId ? `[[doc:${circle.name}:${title}]]` : `[[doc:${title}]]`;
}
