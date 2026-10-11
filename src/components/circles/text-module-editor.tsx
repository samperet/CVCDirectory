"use client";

import { useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Link2 } from "lucide-react";
import { markdownToProse, proseToMarkdown, type ProseNode } from "@/lib/wiki/prose";
import { wikiExtensions } from "@/components/wiki/editor-schema";
import { EditorContextMenu } from "@/components/wiki/editor-context-menu";
import {
  DividerButton,
  HighlightMenu,
  HighlightTools,
  InsertTableButton,
  LinkDialog,
  ListButtons,
  MarkButtons,
  StyleMenu,
  TableTools,
  ToolbarButton,
  ToolbarSeparator,
  UndoRedo,
} from "@/components/wiki/editor-toolbar";

/**
 * The visual editor for a Custom Text module: the wiki's formatting —
 * headings, quotes and callouts, bold, italic and highlights, lists and
 * checklists, links, tables, collapsible sections, and dividers — without
 * the page-only parts (photos, polls, embedded pages). Saves Markdown.
 */
export function TextModuleEditor({
  markdown,
  onChange,
}: {
  markdown: string;
  onChange: (markdown: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [linking, setLinking] = useState(false);
  const latest = useRef(onChange);
  latest.current = onChange;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => markdownToProse(markdown), []);
  // Only a real change is reported (not a click that changes nothing).
  const said = useRef<string | null>(null);
  if (said.current === null) said.current = proseToMarkdown(initial).trimEnd();
  const editor = useEditor({
    immediatelyRender: false,
    extensions: wikiExtensions({
      placeholder: "Write what this circle wants everyone to see — # for a heading, - for a list…",
      onLinkShortcut: () => setLinking(true),
    }),
    content: initial,
    editorProps: { attributes: { class: "wiki-prose document-body min-h-[12rem]" } },
    onUpdate: ({ editor: current }) => {
      const value = proseToMarkdown(current.getJSON() as ProseNode);
      if (value.trimEnd() === said.current) return;
      said.current = value.trimEnd();
      latest.current(value);
    },
  });
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber });
  return (
    <div className="wiki-editor">
      {editor ? (
        <div
          className="wiki-toolbar flex flex-wrap items-center gap-0.5 px-2 py-1.5"
          role="toolbar"
          aria-label="Formatting"
        >
          <UndoRedo editor={editor} />
          <ToolbarSeparator />
          <StyleMenu editor={editor} />
          <MarkButtons editor={editor} />
          <HighlightMenu editor={editor} />
          <ToolbarSeparator />
          <ListButtons editor={editor} />
          <ToolbarSeparator />
          <ToolbarButton title="Create link" onClick={() => setLinking(true)}>
            <Link2 className="h-4 w-4" />
          </ToolbarButton>
          <InsertTableButton editor={editor} />
          <DividerButton editor={editor} />
          <TableTools editor={editor} />
        </div>
      ) : (
        <div className="wiki-toolbar h-11" />
      )}
      <div ref={host} className="relative">
        <EditorContent editor={editor} />
        {editor ? <HighlightTools editor={editor} host={host} /> : null}
      </div>
      {editor ? <EditorContextMenu editor={editor} onLink={() => setLinking(true)} /> : null}
      {editor && linking ? <LinkDialog editor={editor} onClose={() => setLinking(false)} /> : null}
    </div>
  );
}
