import { normalizeWikiLinks, parseWikiLink, type CircleRef, unmark } from "./links";

/**
 * A page's headings and the sections under them — for "On this page", and
 * for embedding one section of a page in another (`::embed{page section}`).
 * Shared by the server and the browser.
 */

/** A heading's anchor, from its text: "Mowing & tools" → "mowing-tools". */
export const headingSlug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";

/** A heading line's level and plain text, or null (`#`–`######`). */
function headingOf(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  const text = unmark(match[2])
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_m, target: string, label?: string) => label ?? target.slice(target.lastIndexOf(":") + 1)
    )
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\\([^\s])/g, "$1")
    .trim();
  return text ? { level: match[1].length, text } : null;
}

/** Each line, with whether it's inside a fenced code block. */
function linesOf(markdown: string) {
  let fence: string | null = null;
  return normalizeWikiLinks(markdown)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const opens = line.trim().match(/^(`{3,}|~{3,})/);
      const inCode = !!fence || !!opens;
      if (fence && line.trim().startsWith(fence)) fence = null;
      else if (!fence && opens) fence = opens[1];
      return { line, inCode };
    });
}

/** The page's headings (levels 1–3, outside code blocks), for "On this page". */
export function tableOfContents(markdown: string) {
  const headings: { level: number; text: string; id: string }[] = [];
  for (const { line, inCode } of linesOf(markdown)) {
    const heading = !inCode && headingOf(line);
    if (heading && heading.level <= 3) headings.push({ ...heading, id: headingSlug(heading.text) });
  }
  return headings;
}

/**
 * One section of a page: the heading named (matched loosely, by its anchor)
 * and everything under it, up to the next heading at its level or above.
 * Null when the page has no such heading.
 */
export function sectionOf(markdown: string, heading: string): string | null {
  const wanted = headingSlug(heading);
  const lines = linesOf(markdown);
  const start = lines.findIndex(({ line, inCode }) => {
    const found = !inCode && headingOf(line);
    return !!found && headingSlug(found.text) === wanted;
  });
  if (start < 0) return null;
  const level = headingOf(lines[start].line)!.level;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const found = !lines[index].inCode && headingOf(lines[index].line);
    if (found && found.level <= level) {
      end = index;
      break;
    }
  }
  return lines
    .slice(start, end)
    .map(({ line }) => line)
    .join("\n")
    .trim();
}

/** `::embed{page="…" section="…"}`, on a line of its own. */
export const EMBED_DIRECTIVE = /^[ \t]*::embed\{([^}\n]*)\}[ \t]*$/gm;

/** The value of `name="…"` in a directive's attributes. */
const attribute = (attributes: string, name: string) =>
  attributes.match(new RegExp(`(?:^|\\s)${name}="([^"\\n]*)"`))?.[1]?.trim();

/** The pages (and sections) a page embeds, outside code. */
export function embedsIn(markdown: string): { page: string; section?: string }[] {
  const text = linesOf(markdown)
    .filter(({ inCode }) => !inCode)
    .map(({ line }) => line)
    .join("\n");
  const found: { page: string; section?: string }[] = [];
  for (const match of Array.from(text.matchAll(EMBED_DIRECTIVE))) {
    const page = attribute(match[1], "page");
    const section = attribute(match[1], "section");
    if (page) found.push({ page, ...(section ? { section } : {}) });
  }
  return found;
}

/** The directive embedding a page (or one of its sections). */
export const embedText = (page: string, section?: string) =>
  `::embed{page="${page.replace(/"/g, "")}"${
    section ? ` section="${section.replace(/"/g, "")}"` : ""
  }}`;

/** The pages a page embeds (read as links are). */
export function embeddedPages(markdown: string, circles: CircleRef[]) {
  return embedsIn(markdown).flatMap(({ page }) => {
    const link = parseWikiLink(page, circles);
    return link.kind === "page" ? [link] : [];
  });
}
