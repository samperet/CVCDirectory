import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Keeping your place while someone else's changes flow into the visual
 * editor: note which top-level block the cursor is in (and how far along
 * its text), and put it back in that block afterwards — wherever the block
 * ended up.
 */

export interface CursorMark {
  /** The top-level block it's in. */
  index: number;
  /** That block's text, to find it again. */
  text: string;
  /** How far into the block's text. */
  offset: number;
}

export function captureCursor(editor: Editor): CursorMark | null {
  const { doc, selection } = editor.state;
  const $anchor = selection.$anchor;
  if ($anchor.depth < 1) return null;
  const index = $anchor.index(0);
  const block = doc.child(index);
  const start = $anchor.before(1) + 1;
  // Count the text before the cursor the way `restoreCursor` walks it: text nodes only.
  let offset = 0;
  block.descendants((node, pos) => {
    const from = start + pos;
    if (from >= $anchor.pos) return false;
    if (node.isText) offset += Math.min(node.text?.length ?? 0, $anchor.pos - from);
    return true;
  });
  return { index, text: block.textContent, offset };
}

/** Put the cursor back; `mineAt` maps old block positions to new ones. */
export function restoreCursor(editor: Editor, mark: CursorMark, mineAt: number[] | null) {
  const { doc } = editor.state;
  if (!doc.childCount) return;
  const near = Math.min(doc.childCount - 1, Math.max(0, mineAt?.[mark.index] ?? mark.index));
  // The same block's text, nearest where it should be; else whatever is there.
  let index = near;
  for (let step = 0; step <= 3; step++) {
    const found = [near - step, near + step].find(
      (at) => at >= 0 && at < doc.childCount && doc.child(at).textContent === mark.text
    );
    if (found !== undefined) {
      index = found;
      break;
    }
  }
  let start = 0;
  for (let at = 0; at < index; at++) start += doc.child(at).nodeSize;
  const block = doc.child(index);
  let position = start + block.nodeSize - 1;
  let remaining = mark.offset;
  block.descendants((node, pos) => {
    if (remaining < 0) return false;
    if (node.isText) {
      const size = node.text?.length ?? 0;
      if (remaining <= size) {
        position = start + 1 + pos + remaining;
        remaining = -1;
        return false;
      }
      remaining -= size;
    }
    return true;
  });
  const safe = Math.min(Math.max(1, position), doc.content.size);
  editor.view.dispatch(
    editor.state.tr
      .setSelection(TextSelection.near(doc.resolve(safe)))
      .setMeta("addToHistory", false)
  );
}
