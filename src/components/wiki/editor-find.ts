import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { matchesIn } from "@/lib/wiki/find";
import { markdownToProse, rawMarkdown, type ProseNode } from "@/lib/wiki/prose";

/**
 * Find and replace in the visual editor: what's searched for is marked
 * wherever it appears (the current one more strongly), across bold, links
 * and other formatting within a block; **Replace** changes the current one
 * (keeping its formatting) and moves on, **Replace all** changes every one
 * in a single step that one Undo takes back. What's kept as written (raw
 * HTML like `<u>`, inline or a whole block) is searched too, as it reads;
 * replacing in it rewrites that text, read again as Markdown — so replacing
 * `<u>` with nothing takes the tag away. The find bar is `find-bar.tsx`;
 * Ctrl/⌘+F opens it from the text, Ctrl+H (or ⌘⇧H) with Replace.
 */

export type FindMatch = {
  from: number;
  to: number;
  /** In something kept as written: the node's position, and where in its text. */
  raw?: { pos: number; start: number; end: number };
};

const isRaw = (node: ProseMirrorNode) =>
  node.type.name === "rawInline" || node.type.name === "rawBlock";

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  /** The current match's index (-1 with none). */
  current: number;
  decorations: DecorationSet;
}

type FindMeta = { query?: string; caseSensitive?: boolean; current?: number; after?: number };

export const findKey = new PluginKey<FindState>("findReplace");

const EMPTY: FindState = {
  query: "",
  caseSensitive: false,
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
};

/**
 * Each run of text in a block searched as one (across bold, links and other
 * formatting), up to anything that isn't text — a photo, a link to a page,
 * a mention; and each thing kept as written searched on its own, as it reads.
 */
function matchesOf(doc: ProseMirrorNode, query: string, caseSensitive: boolean): FindMatch[] {
  const found: FindMatch[] = [];
  const searchRaw = (node: ProseMirrorNode, pos: number) => {
    const text = rawMarkdown(node.attrs.mdast);
    for (const [start, end] of matchesIn(text, query, caseSensitive))
      found.push({ from: pos, to: pos + node.nodeSize, raw: { pos, start, end } });
  };
  doc.descendants((node, pos) => {
    if (node.type.name === "rawBlock") {
      searchRaw(node, pos);
      return false;
    }
    if (!node.isTextblock) return true;
    let text = "";
    let at: number[] = [];
    const flush = () => {
      for (const [start, end] of matchesIn(text, query, caseSensitive))
        found.push({ from: at[start], to: at[end - 1] + 1 });
      text = "";
      at = [];
    };
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && child.text) {
        for (let index = 0; index < child.text.length; index++) at.push(start + index);
        text += child.text;
        return;
      }
      flush();
      if (isRaw(child)) searchRaw(child, start);
    });
    flush();
    return false;
  });
  return found.sort((a, b) => a.from - b.from || (a.raw?.start ?? 0) - (b.raw?.start ?? 0));
}

/** Something kept as written, its text changed, as what the editor makes of it now (nothing, if it's empty). */
function rewritten(node: ProseMirrorNode, text: string, schema: Schema): ProseMirrorNode[] {
  if (!text.trim()) return [];
  if (node.type.name === "rawBlock")
    return (markdownToProse(text).content ?? []).map((block) => schema.nodeFromJSON(block));
  // Inline: read after an invisible character, so it isn't taken for a block of its own.
  const blocks = markdownToProse(`\u2063${text}`).content ?? [];
  let inline: ProseNode[] =
    blocks.length === 1 && blocks[0].type === "paragraph"
      ? [...(blocks[0].content ?? [])]
      : [{ type: "text", text }];
  if (inline[0]?.type === "text" && inline[0].text?.startsWith("\u2063")) {
    const rest = inline[0].text.slice(1);
    inline = rest ? [{ ...inline[0], text: rest }, ...inline.slice(1)] : inline.slice(1);
  }
  return inline.map((json) => {
    const made = schema.nodeFromJSON(json);
    return made.mark(node.marks.reduce((set, mark) => mark.addToSet(set), made.marks));
  });
}

/** Replace these matches (any order) in one transaction, last first so positions hold. */
function replaceMatches(tr: Transaction, matches: FindMatch[], replacement: string) {
  const raws = new Map<number, FindMatch[]>();
  const edits: { at: number; run: () => void }[] = [];
  for (const match of matches) {
    if (match.raw) {
      const list = raws.get(match.raw.pos) ?? [];
      if (!list.length)
        edits.push({ at: match.raw.pos, run: () => replaceInRaw(match.raw!.pos, list) });
      list.push(match);
      raws.set(match.raw.pos, list);
    } else
      edits.push({
        at: match.from,
        run: () =>
          replacement
            ? tr.insertText(replacement, match.from, match.to)
            : tr.delete(match.from, match.to),
      });
  }
  const replaceInRaw = (pos: number, list: FindMatch[]) => {
    const node = tr.doc.nodeAt(pos);
    if (!node || !isRaw(node)) return;
    let text = rawMarkdown(node.attrs.mdast);
    for (const { raw } of [...list].sort((a, b) => b.raw!.start - a.raw!.start))
      text = text.slice(0, raw!.start) + replacement + text.slice(raw!.end);
    const nodes = rewritten(node, text, tr.doc.type.schema);
    // The page's only block, emptied: an empty paragraph instead.
    if (!nodes.length && node.isBlock && tr.doc.childCount === 1)
      nodes.push(tr.doc.type.schema.nodes.paragraph.create());
    tr.replaceWith(pos, pos + node.nodeSize, nodes);
  };
  for (const edit of edits.sort((a, b) => b.at - a.at)) edit.run();
}

/** The first match at or after a position, else the first (-1 with none). */
const firstFrom = (matches: FindMatch[], pos: number) => {
  if (!matches.length) return -1;
  const index = matches.findIndex((match) => match.from >= pos);
  return index === -1 ? 0 : index;
};

const decorate = (doc: ProseMirrorNode, matches: FindMatch[], current: number) =>
  DecorationSet.create(
    doc,
    matches.map((match, index) => {
      const attrs = { class: index === current ? "find-match find-match-current" : "find-match" };
      // Something kept as written is marked whole (its text isn't the editor's to mark).
      return match.raw && doc.nodeAt(match.from)?.isBlock
        ? Decoration.node(match.from, match.to, attrs)
        : Decoration.inline(match.from, match.to, attrs);
    })
  );

/** The editor extension: the matches, kept up to date as the text changes. `onOpen` is for the shortcuts. */
export const FindReplace = (onOpen?: (replace: boolean) => void) =>
  Extension.create({
    name: "findReplace",
    addProseMirrorPlugins() {
      return [
        new Plugin<FindState>({
          key: findKey,
          state: {
            init: () => EMPTY,
            apply(tr, previous) {
              const meta = tr.getMeta(findKey) as FindMeta | undefined;
              if (!meta && !tr.docChanged) return previous;
              const query = meta?.query ?? previous.query;
              const caseSensitive = meta?.caseSensitive ?? previous.caseSensitive;
              if (!query) return { ...EMPTY, caseSensitive };
              const matches = matchesOf(tr.doc, query, caseSensitive);
              const count = matches.length;
              let current: number;
              if (meta?.current !== undefined)
                current = count ? ((meta.current % count) + count) % count : -1;
              else if (meta?.after !== undefined) current = firstFrom(matches, meta.after);
              else if (meta) current = firstFrom(matches, tr.selection.from);
              else {
                // The text changed: stay with the match that was current.
                const was = previous.matches[previous.current];
                current = was
                  ? firstFrom(matches, tr.mapping.map(was.from))
                  : firstFrom(matches, 0);
              }
              return {
                query,
                caseSensitive,
                matches,
                current,
                decorations: decorate(tr.doc, matches, current),
              };
            },
          },
          props: { decorations: (state) => findKey.getState(state)?.decorations },
        }),
      ];
    },
    addKeyboardShortcuts(): Record<string, () => boolean> {
      if (!onOpen) return {};
      const open = (replace: boolean) => () => {
        onOpen(replace);
        return true;
      };
      return { "Mod-f": open(false), "Mod-h": open(true), "Mod-Shift-h": open(true) };
    },
  });

export const findState = (editor: Editor): FindState =>
  (editor.isDestroyed ? null : findKey.getState(editor.state)) ?? EMPTY;

/** Search for this (or "" to stop): the first match from the cursor becomes current. */
export function setFind(editor: Editor, query: string, caseSensitive: boolean) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { query, caseSensitive }));
}

/** Move to the next (1) or previous (-1) match, wrapping round. */
export function findStep(editor: Editor, step: 1 | -1) {
  const { current, matches } = findState(editor);
  if (!matches.length) return;
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { current: current + step }));
}

/** Scroll the current match into the middle of the window (the cursor stays where it was). */
export function revealCurrent(editor: Editor) {
  const { matches, current } = findState(editor);
  const match = matches[current];
  if (!match || editor.isDestroyed) return;
  const { node } = editor.view.domAtPos(match.from);
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  element?.scrollIntoView({ block: "center", behavior: "smooth" });
}

/** Put the cursor on the current match (selected), as the find bar closes. */
export function selectCurrent(editor: Editor) {
  const { matches, current } = findState(editor);
  const match = matches[current];
  if (!match || editor.isDestroyed) return;
  const { doc } = editor.state;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      match.raw && doc.nodeAt(match.from)?.isBlock
        ? NodeSelection.create(doc, match.from)
        : TextSelection.create(doc, match.from, match.to)
    )
  );
}

/** Replace the current match (keeping its formatting) and move to the next. */
export function replaceCurrent(editor: Editor, replacement: string) {
  const { matches, current } = findState(editor);
  const match = matches[current];
  if (!match) return false;
  const tr = editor.state.tr;
  replaceMatches(tr, [match], replacement);
  editor.view.dispatch(tr.setMeta(findKey, { after: tr.mapping.map(match.to) }));
  return true;
}

/** Replace every match, in one step (one Undo). How many were replaced. */
export function replaceAll(editor: Editor, replacement: string) {
  const { matches } = findState(editor);
  if (!matches.length) return 0;
  const tr = editor.state.tr;
  replaceMatches(tr, matches, replacement);
  editor.view.dispatch(tr);
  return matches.length;
}
