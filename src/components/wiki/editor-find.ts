import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { matchesIn } from "@/lib/wiki/find";

/**
 * Find and replace in the visual editor: what's searched for is marked
 * wherever it appears (the current one more strongly), across bold, links
 * and other formatting within a block; **Replace** changes the current one
 * (keeping its formatting) and moves on, **Replace all** changes every one
 * in a single step that one Undo takes back. The find bar is `find-bar.tsx`;
 * Ctrl/⌘+F opens it from the text, Ctrl+H (or ⌘⇧H) with Replace.
 */

export type FindMatch = { from: number; to: number };

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

/** Each block's text, with photos, links to pages and mentions as one character each, searched. */
function matchesOf(doc: ProseMirrorNode, query: string, caseSensitive: boolean): FindMatch[] {
  const found: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    const at: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && child.text) {
        for (let index = 0; index < child.text.length; index++) at.push(start + index);
        text += child.text;
      } else {
        at.push(start);
        text += "￼";
      }
    });
    for (const [start, end] of matchesIn(text, query, caseSensitive))
      found.push({ from: at[start], to: at[end - 1] + 1 });
    return false;
  });
  return found;
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
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class: index === current ? "find-match find-match-current" : "find-match",
      })
    )
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
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
  );
}

/** Replace the current match (keeping its formatting) and move to the next. */
export function replaceCurrent(editor: Editor, replacement: string) {
  const { matches, current } = findState(editor);
  const match = matches[current];
  if (!match) return false;
  const tr = editor.state.tr;
  if (replacement) tr.insertText(replacement, match.from, match.to);
  else tr.delete(match.from, match.to);
  editor.view.dispatch(tr.setMeta(findKey, { after: match.from + replacement.length }));
  return true;
}

/** Replace every match, in one step (one Undo). How many were replaced. */
export function replaceAll(editor: Editor, replacement: string) {
  const { matches } = findState(editor);
  if (!matches.length) return 0;
  const tr = editor.state.tr;
  for (const match of [...matches].reverse()) {
    if (replacement) tr.insertText(replacement, match.from, match.to);
    else tr.delete(match.from, match.to);
  }
  editor.view.dispatch(tr);
  return matches.length;
}
