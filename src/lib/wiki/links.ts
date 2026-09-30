/**
 * `[[Page title]]` links between wiki pages. The visual editor writes the
 * brackets escaped (`\[\[Page title\]\]`); this puts them back so pages keep
 * readable links.
 */
export const normalizeWikiLinks = (markdown: string) =>
  markdown.replace(/\\?\[\\?\[([^\]\n\\]{1,120}(?:\|[^\]\n\\]{1,120})?)\\?\]\\?\]/g, (_match, inner: string) => `[[${inner}]]`);
