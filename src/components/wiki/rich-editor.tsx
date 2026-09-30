"use client";

import "@mdxeditor/editor/style.css";
import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  Separator,
  StrikeThroughSupSubToggles,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
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
import { normalizeWikiLinks } from "@/lib/wiki/links";

export interface RichEditorHandle {
  /** Replace the text (e.g. restoring a saved draft). */
  setMarkdown: (markdown: string) => void;
  focus: () => void;
}

/** Insert a `[[Page title]]` link to another page in this wiki. */
function WikiLinkMenu({ pages, onPick }: { pages: string[]; onPick: (title: string) => void }) {
  if (!pages.length) return null;
  return (
    <select
      value=""
      onChange={(event) => {
        if (event.target.value) onPick(event.target.value);
      }}
      className="h-8 max-w-[11rem] rounded-md border border-border bg-white px-2 text-sm text-foreground"
      aria-label="Link to a wiki page"
      title="Link to another page in this wiki"
    >
      <option value="">Link a page…</option>
      {pages.map((title) => (
        <option key={title} value={title}>
          {title}
        </option>
      ))}
    </select>
  );
}

/**
 * The wiki's visual editor (MDXEditor): a formatting toolbar, tables, links,
 * code blocks, and Markdown shortcuts as you type (`#`, `-`, `**`), saving
 * plain Markdown. The toolbar's right-hand toggle shows the raw Markdown, or
 * what's changed since the page was last saved. HTML tags stay as text.
 */
export const RichEditor = forwardRef<
  RichEditorHandle,
  { markdown: string; savedMarkdown: string; pageTitles: string[]; onChange: (markdown: string) => void; onError: () => void }
>(function RichEditor({ markdown, savedMarkdown, pageTitles, onChange, onError }, ref) {
  const editor = useRef<MDXEditorMethods>(null);
  useImperativeHandle(ref, () => ({
    setMarkdown: (value) => editor.current?.setMarkdown(value),
    focus: () => editor.current?.focus(),
  }));
  return (
    <MDXEditor
      ref={editor}
      markdown={markdown}
      onChange={(value) => onChange(normalizeWikiLinks(value))}
      onError={onError}
      suppressHtmlProcessing
      className="wiki-editor rounded-lg border border-border bg-white"
      contentEditableClassName="wiki-prose min-h-[20rem] px-4 py-3"
      placeholder="Start writing — or type # for a heading, - for a list, ** for bold…"
      plugins={[
        headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
        codeMirrorPlugin({ codeBlockLanguages: { "": "Plain text", js: "JavaScript", py: "Python", sh: "Shell" }, autoLoadLanguageSupport: false }),
        markdownShortcutPlugin(),
        diffSourcePlugin({ diffMarkdown: savedMarkdown, viewMode: "rich-text" }),
        toolbarPlugin({
          toolbarClassName: "wiki-toolbar",
          toolbarContents: () => (
            <DiffSourceToggleWrapper options={["rich-text", "diff", "source"]}>
              <UndoRedo />
              <Separator />
              <BlockTypeSelect />
              <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
              <StrikeThroughSupSubToggles options={["Strikethrough"]} />
              <CodeToggle />
              <Separator />
              <ListsToggle options={["bullet", "number", "check"]} />
              <Separator />
              <CreateLink />
              <WikiLinkMenu pages={pageTitles} onPick={(title) => editor.current?.insertMarkdown(`[[${title}]]`)} />
              <Separator />
              <InsertTable />
              <InsertThematicBreak />
              <InsertCodeBlock />
            </DiffSourceToggleWrapper>
          ),
        }),
      ]}
    />
  );
});
