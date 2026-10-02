import type { WikiPage } from "./store";
import { POLL_DIRECTIVE } from "@/lib/polls/wiki";
import { EMBED_DIRECTIVE } from "./sections";
import { DEFAULT_PAGE_COLOR, PAGE_COLORS, type PageColor } from "./colors";

export const pageColor = (page: Pick<WikiPage, "color">): PageColor =>
  (PAGE_COLORS as readonly string[]).includes(page.color ?? "")
    ? (page.color as PageColor)
    : DEFAULT_PAGE_COLOR;

/**
 * A page's opening, as plain text: links by their words, polls by their
 * questions, collapsible sections by their titles, embedded pages as "↳ Title"; no images, headings, or
 * markup.
 */
export function excerptOf(markdown: string, length = 400, polls: Map<string, string> = new Map()) {
  const text = markdown
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1/gm, " ")
    .replace(EMBED_DIRECTIVE, (_m, attributes: string) => {
      const page = attributes.match(/page="([^"\n]*)"/)?.[1] ?? "";
      const section = attributes.match(/section="([^"\n]*)"/)?.[1];
      const title = page.slice(page.lastIndexOf(":") + 1).trim();
      return title ? `↳ ${title}${section ? ` › ${section}` : ""}` : "";
    })
    .replace(POLL_DIRECTIVE, (_m, id?: string, short?: string) => {
      const question = polls.get((id ?? short ?? "").toLowerCase());
      return question ? `Poll: ${question}` : "";
    })
    .replace(
      /^[ \t]*:::\s*details(?:\[([^\]\n]*)\])?(?:\{[^}\n]*?title="([^"\n]*)"[^}\n]*\})?.*$/gm,
      (_m, label?: string, title?: string) => title ?? label ?? ""
    )
    .replace(/^[ \t]*:{2,}[ \t]*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(
      /\[\[(?:doc:)?(?:[^\]|]*:)?([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_m, target: string, label?: string) => label ?? target
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\\([^\s])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, "")}…` : text;
}
