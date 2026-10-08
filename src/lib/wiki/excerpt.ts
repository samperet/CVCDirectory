import { POLL_DIRECTIVE } from "@/lib/polls/wiki";
import { PROPOSAL_DIRECTIVE } from "@/lib/proposals/shared";
import { EMBED_DIRECTIVE } from "./sections";
import { unmark } from "./links";

/**
 * A page's opening, as plain text: links by their words, polls by their
 * questions (proposals left out), collapsible sections by their titles, embedded pages as "↳ Title",
 * highlighted text as the text; no images, headings, or markup.
 */
export function excerptOf(markdown: string, length = 400, polls: Map<string, string> = new Map()) {
  const text = unmark(markdown)
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
    .replace(PROPOSAL_DIRECTIVE, "")
    .replace(
      /^[ \t]*:::\s*details(?:\[([^\]\n]*)\])?(?:\{[^}\n]*?title="([^"\n]*)"[^}\n]*\})?.*$/gm,
      (_m, label?: string, title?: string) => title ?? label ?? ""
    )
    .replace(/^[ \t]*:::\s*callout\b.*$/gm, "")
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
