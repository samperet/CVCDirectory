import { decodeXmlText, extractText, unzipEntries, type DocumentKind } from "./files";

/**
 * An uploaded file's text as a written page's Markdown, for "Turn into a
 * page". A Word file keeps its headings, bold and italic words, and bulleted
 * and numbered lists; a PDF, slides, or a text file comes in paragraph by
 * paragraph (a Markdown file as it is). The words are never changed: any
 * character Markdown would read as formatting is escaped. "" when the file
 * has no text (a scan, a photo, an old Office format).
 */
export async function fileToMarkdown(
  bytes: Uint8Array,
  kind: DocumentKind,
  fileName: string
): Promise<string> {
  if (kind === "docx") {
    try {
      const markdown = docxToMarkdown(bytes);
      if (markdown.trim()) return markdown;
    } catch (error) {
      console.error(
        "[documents] couldn't read Word formatting",
        error instanceof Error ? error.name : "error"
      );
    }
  }
  if (kind === "text" && /\.(md|markdown)$/i.test(fileName))
    return new TextDecoder().decode(bytes).trim();
  const text = await extractText(bytes, kind);
  return text
    .split("\n")
    .map((line) => escapeLine(line.trim()))
    .filter(Boolean)
    .join("\n\n");
}

/** Text as Markdown that reads exactly as written: formatting characters escaped. */
export function escapeInline(text: string) {
  return text.replace(/[\\`*_[\]<>~|]/g, "\\$&");
}

/** A whole line, also escaping what would start a heading, quote, list, or rule. */
export function escapeLine(text: string) {
  return escapeInline(text)
    .replace(/^(#{1,6})(?=\s|$)/, "\\$1")
    .replace(/^([-+=])(?=\s|$)/, "\\$1")
    .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2");
}

const ORDERED = /^(decimal|lowerLetter|upperLetter|lowerRoman|upperRoman|decimalZero)$/;
const attr = (xml: string, name: string) =>
  xml.match(new RegExp(`<w:${name}\\b[^>]*\\bw:val="([^"]*)"`))?.[1] ?? null;
/** A run property that's on: present, and not switched off with val="0"/"false". */
const on = (props: string, name: string) => {
  const match = props.match(new RegExp(`<w:${name}(\\s[^>]*)?/>`));
  return !!match && !/w:val="(0|false|none)"/.test(match[1] ?? "");
};

/** Word's paragraphs as Markdown blocks. */
export function docxToMarkdown(bytes: Uint8Array): string {
  const decoder = new TextDecoder();
  const files = unzipEntries(bytes, (name) =>
    ["word/document.xml", "word/styles.xml", "word/numbering.xml"].includes(name)
  );
  const documentXml = files["word/document.xml"] ? decoder.decode(files["word/document.xml"]) : "";
  if (!documentXml) return "";

  // Style ids to names ("Heading1" → "heading 1"), to find headings whatever the language of the ids.
  const styleNames = new Map<string, string>();
  if (files["word/styles.xml"]) {
    for (const match of decoder
      .decode(files["word/styles.xml"])
      .matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
      const name = attr(match[2], "name");
      if (name) styleNames.set(match[1], name.toLowerCase());
    }
  }
  // Which lists are numbered: numId → abstractNumId → each level's format.
  const ordered = new Map<string, boolean[]>();
  if (files["word/numbering.xml"]) {
    const numbering = decoder.decode(files["word/numbering.xml"]);
    const abstract = new Map<string, boolean[]>();
    for (const match of numbering.matchAll(
      /<w:abstractNum\b[^>]*w:abstractNumId="([^"]+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g
    )) {
      const levels: boolean[] = [];
      for (const level of match[2].matchAll(
        /<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g
      ))
        levels[Number(level[1])] = ORDERED.test(attr(level[2], "numFmt") ?? "");
      abstract.set(match[1], levels);
    }
    for (const match of numbering.matchAll(
      /<w:num\b[^>]*w:numId="([^"]+)"[^>]*>([\s\S]*?)<\/w:num>/g
    )) {
      const id = attr(match[2], "abstractNumId");
      if (id && abstract.has(id)) ordered.set(match[1], abstract.get(id)!);
    }
  }

  const body = documentXml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? documentXml;
  const blocks: { text: string; list: string | null }[] = [];
  // Each list's count at each depth, by list (a new list starts again at 1).
  const counters = new Map<string, number[]>();
  for (const paragraph of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const xml = paragraph[1] ?? "";
    const props = xml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? "";
    const style =
      styleNames.get(attr(props, "pStyle") ?? "") ?? attr(props, "pStyle")?.toLowerCase() ?? "";
    const text = runsToMarkdown(xml.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, ""));
    if (!text.trim()) continue;
    const heading = style.match(/^heading\s*(\d)$/) ?? (style === "title" ? ["", "1"] : null);
    const numId = attr(props, "numId");
    if (heading) {
      const level = Math.min(Number(heading[1]) + 1, 4);
      blocks.push({ text: `${"#".repeat(level)} ${plain(text)}`, list: null });
    } else if (numId && numId !== "0") {
      const depth = Number(attr(props, "ilvl") ?? 0);
      const numberedList = ordered.get(numId)?.[depth] ?? false;
      const count = counters.get(numId) ?? [];
      count.length = depth + 1;
      count[depth] = (count[depth] ?? 0) + 1;
      counters.set(numId, count);
      const marker = numberedList ? `${count[depth]}.` : "-";
      blocks.push({ text: `${"   ".repeat(depth)}${marker} ${text}`, list: numId });
    } else {
      blocks.push({ text: escapeStart(text), list: null });
    }
  }
  // A list's items sit together; everything else (another list too) is its own block.
  return blocks
    .map((block, index) =>
      index === 0
        ? block.text
        : `${block.list && blocks[index - 1].list === block.list ? "\n" : "\n\n"}${block.text}`
    )
    .join("")
    .trim();
}

/** A heading's words without bold/italic markers (a heading is bold already). */
const plain = (markdown: string) => markdown.replace(/(?<!\\)(\*\*|\*)/g, "");

/** Escape what would make a paragraph's start read as a heading, list, or quote. */
const escapeStart = (markdown: string) =>
  markdown
    .replace(/^(#{1,6})(?=\s|$)/, "\\$1")
    .replace(/^([-+=])(?=\s|$)/, "\\$1")
    .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2");

/** A paragraph's runs: their text, escaped, with bold and italic stretches marked. */
function runsToMarkdown(xml: string): string {
  const runs: { text: string; bold: boolean; italic: boolean }[] = [];
  for (const run of xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const props = run[1].match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
    let text = "";
    for (const piece of run[1].matchAll(
      /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g
    )) {
      if (piece[1] !== undefined) text += decodeXmlText(piece[1]);
      else text += piece[2] === "tab" ? " " : "\n";
    }
    if (text) runs.push({ text, bold: on(props, "b"), italic: on(props, "i") });
  }
  // Runs with the same formatting join, so one bold phrase is marked once.
  const merged: typeof runs = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic) last.text += run.text;
    else merged.push({ ...run });
  }
  return merged
    .map(({ text, bold, italic }) => {
      const escaped = escapeInline(text).replace(/\n/g, "  \n");
      const marker = bold && italic ? "***" : bold ? "**" : italic ? "*" : "";
      if (!marker || !escaped.trim()) return escaped;
      // Markers hug the words: spaces stay outside them.
      const [, before, words, after] = escaped.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      return `${before}${marker}${words}${marker}${after}`;
    })
    .join("");
}
