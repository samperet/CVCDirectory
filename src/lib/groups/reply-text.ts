import { MARKER_TEXT } from "./compose";

/**
 * Turning an email into a forum message (pure): its new words only — cut at
 * our "Reply above this line" marker, at the "On … wrote:" line (or
 * Outlook's "From:/Sent:" block, or "Original Message"), with quoted lines,
 * "Sent from my iPhone", and a "-- " signature removed. HTML-only emails are
 * turned into plain text first; HTML is never kept.
 */

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** HTML to plain text: paragraphs and line breaks kept, lists as dashes, everything else dropped. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol)>/gi, "\n\n")
    .replace(/<a [^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) =>
      label.replace(/<[^>]+>/g, "").trim() === href ? href : `${label} (${href})`
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CUT_LINES: RegExp[] = [
  /^-{2,}\s*original message\s*-{2,}/i,
  /^_{10,}\s*$/, // Outlook's rule above a quoted message
  /^-{5,}\s*forwarded message/i,
  /^(from|von|de):\s.+$/i, // Outlook's header block (checked with the next line)
];

/** Just the new words of a reply. */
export function extractReply(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.includes(MARKER_TEXT)) break;
    // "On Sat, Oct 4, 2026 at 9:12 AM Ada Ash <…> wrote:" — sometimes split over two lines.
    if (/^on\b.+wrote:\s*$/i.test(trimmed)) break;
    if (
      /^on\b.+/i.test(trimmed) &&
      /wrote:\s*$/i.test(lines[i + 1]?.trim() ?? "") &&
      trimmed.length < 200
    )
      break;
    if (/^le\b.+a écrit\s*:\s*$/i.test(trimmed) || /^am\b.+schrieb.*:\s*$/i.test(trimmed)) break;
    if (CUT_LINES.slice(0, 3).some((pattern) => pattern.test(trimmed))) break;
    if (
      CUT_LINES[3].test(trimmed) &&
      /^(sent|date|gesendet|envoyé):\s/i.test(lines[i + 1]?.trim() ?? "")
    )
      break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }
  let body = kept.join("\n");
  // A "-- " signature, and phone sign-offs.
  const signature = body.search(/\n-- ?\n/);
  if (signature !== -1) body = body.slice(0, signature);
  body = body
    .replace(
      /\n\s*(sent from my (iphone|ipad|android|phone|mobile)[^\n]*|get outlook for (ios|android)[^\n]*)\s*$/i,
      ""
    )
    .trim();
  return body.replace(/\n{3,}/g, "\n\n");
}
