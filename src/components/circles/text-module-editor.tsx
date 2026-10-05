"use client";

import "@mdxeditor/editor/style.css";
import { useRef } from "react";
import {
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  Separator,
  UndoRedo,
  directivesPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import {
  HighlightButton,
  StyleSelect,
  calloutDirective,
  detailsDirective,
  markDirective,
  otherDirectives,
  textDirectives,
} from "@/components/wiki/rich-editor";

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
  const editor = useRef<MDXEditorMethods>(null);
  return (
    <MDXEditor
      ref={editor}
      markdown={markdown}
      onChange={onChange}
      suppressHtmlProcessing
      className="wiki-editor"
      contentEditableClassName="wiki-prose document-body min-h-[12rem]"
      placeholder="Write what this circle wants everyone to see — # for a heading, - for a list…"
      plugins={[
        headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        markdownShortcutPlugin(),
        directivesPlugin({
          directiveDescriptors: [
            detailsDirective,
            calloutDirective,
            markDirective,
            textDirectives,
            otherDirectives,
          ],
        }),
        toolbarPlugin({
          toolbarClassName: "wiki-toolbar",
          toolbarContents: () => (
            <>
              <UndoRedo />
              <Separator />
              <StyleSelect />
              <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
              <HighlightButton onApply={(value) => editor.current?.insertMarkdown(value)} />
              <Separator />
              <ListsToggle options={["bullet", "number", "check"]} />
              <Separator />
              <CreateLink />
              <InsertTable />
              <InsertThematicBreak />
            </>
          ),
        }),
      ]}
    />
  );
}
