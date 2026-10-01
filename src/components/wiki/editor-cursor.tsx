"use client";

import { useEffect, type MutableRefObject } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $getSelection, $isElementNode, $isRangeSelection, $isTextNode, type LexicalEditor } from "lexical";
import { addComposerChild$, realmPlugin } from "@mdxeditor/editor";

/**
 * Keeping your place while someone else's changes flow into the visual
 * editor: note which top-level block the cursor is in (and how far along
 * its text), and put it back in that block afterwards — wherever the block
 * ended up.
 */

function EditorBridge({ target }: { target: MutableRefObject<LexicalEditor | null> }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    target.current = editor;
    return () => {
      if (target.current === editor) target.current = null;
    };
  }, [editor, target]);
  return null;
}

/** Hands out the editor underneath MDXEditor. */
export const editorBridgePlugin = realmPlugin<{ target: MutableRefObject<LexicalEditor | null> }>({
  init(realm, params) {
    if (params) realm.pubIn({ [addComposerChild$]: () => <EditorBridge target={params.target} /> });
  },
});

export interface CursorMark {
  /** The top-level block it's in. */
  index: number;
  /** That block's text, to find it again. */
  text: string;
  /** How far into the block's text. */
  offset: number;
}

export function captureCursor(editor: LexicalEditor): CursorMark | null {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const anchor = selection.anchor.getNode();
    const top = anchor.getTopLevelElement();
    if (!top) return null;
    let offset = 0;
    if ($isElementNode(top) && $isTextNode(anchor)) {
      for (const node of top.getAllTextNodes()) {
        if (node.is(anchor)) break;
        offset += node.getTextContentSize();
      }
      offset += selection.anchor.offset;
    }
    return { index: top.getIndexWithinParent(), text: top.getTextContent(), offset };
  });
}

/** Put the cursor back; `mineAt` maps old block positions to new ones. */
export function restoreCursor(editor: LexicalEditor, mark: CursorMark, mineAt: number[] | null) {
  editor.update(() => {
    const children = $getRoot().getChildren();
    if (!children.length) return;
    const near = Math.min(children.length - 1, Math.max(0, mineAt?.[mark.index] ?? mark.index));
    // The same block's text, nearest where it should be; else whatever is there.
    let target = children[near];
    for (let step = 0; step <= 3; step++) {
      const found = [children[near - step], children[near + step]].find((child) => child && child.getTextContent() === mark.text);
      if (found) {
        target = found;
        break;
      }
    }
    if (!$isElementNode(target)) {
      target.selectNext();
      return;
    }
    let remaining = mark.offset;
    for (const node of target.getAllTextNodes()) {
      const size = node.getTextContentSize();
      if (remaining <= size) {
        node.select(remaining, remaining);
        return;
      }
      remaining -= size;
    }
    target.selectEnd();
  });
}
