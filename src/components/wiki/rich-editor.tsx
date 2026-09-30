"use client";

import "@mdxeditor/editor/style.css";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { ContainerDirective, TextDirective } from "mdast-util-directive";
import { ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ButtonWithTooltip,
  CodeToggle,
  CreateLink,
  DiffSourceToggleWrapper,
  type DirectiveDescriptor,
  GenericDirectiveEditor,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  NestedLexicalEditor,
  Separator,
  StrikeThroughSupSubToggles,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
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
  useMdastNodeUpdater,
} from "@mdxeditor/editor";
import { normalizeWikiLinks } from "@/lib/wiki/links";
import { LinkPicker } from "@/components/wiki/link-picker";

export interface RichEditorHandle {
  /** Replace the text (e.g. restoring a saved draft). */
  setMarkdown: (markdown: string) => void;
  focus: () => void;
}

/** A collapsible section (`:::details{title="…"}`) in the editor: its title, and what it hides. */
const isLabel = (child: ContainerDirective["children"][number]) => !!(child.data as { directiveLabel?: boolean } | undefined)?.directiveLabel;
/** The text of an mdast node and everything in it. */
function plainText(node: object): string {
  const { value, children } = node as { value?: unknown; children?: object[] };
  return (typeof value === "string" ? value : "") + (children ?? []).map(plainText).join("");
}

function DetailsEditor({ mdastNode }: { mdastNode: ContainerDirective }) {
  const update = useMdastNodeUpdater<ContainerDirective>();
  // The title is its `title` attribute — or, written as `:::details[Title]`, its label.
  const label = mdastNode.children.find(isLabel);
  const title = mdastNode.attributes?.title ?? (label ? plainText(label) : "");
  return (
    <div className="my-2 rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5" contentEditable={false}>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          value={title}
          onChange={(event) =>
            update({ attributes: { ...mdastNode.attributes, title: event.target.value }, children: mdastNode.children.filter((child) => !isLabel(child)) })
          }
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Section title (shown when collapsed)"
          aria-label="Collapsible section title"
          className="w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted"
        />
        <span className="shrink-0 text-xs text-muted">Collapsible</span>
      </div>
      <div className="px-3 py-1">
        <NestedLexicalEditor<ContainerDirective>
          block
          getContent={(node) => node.children.filter((child) => !isLabel(child))}
          getUpdatedMdastNode={(node, children) => ({
            ...node,
            children: [...node.children.filter(isLabel), ...(children as ContainerDirective["children"])],
          })}
        />
      </div>
    </div>
  );
}

const detailsDirective: DirectiveDescriptor<ContainerDirective> = {
  name: "details",
  type: "containerDirective",
  testNode: (node) => node.type === "containerDirective" && node.name === "details",
  attributes: ["title"],
  hasChildren: true,
  Editor: DetailsEditor,
};

/** Text like "Contact:Lynn" parses as a directive; show it as the text it is. */
const textDirectives: DirectiveDescriptor<TextDirective> = {
  name: ":text",
  type: "textDirective",
  testNode: (node) => node.type === "textDirective",
  attributes: [],
  hasChildren: false,
  Editor: ({ mdastNode }) => (
    <span contentEditable={false}>
      :{mdastNode.name}
      {mdastNode.children.length ? `[${mdastNode.children.map(plainText).join("")}]` : ""}
    </span>
  ),
};

/** Anything else that parses as a directive keeps its text rather than breaking the editor. */
const otherDirectives: DirectiveDescriptor = {
  name: "*",
  testNode: () => true,
  attributes: [],
  hasChildren: true,
  Editor: GenericDirectiveEditor,
};

/**
 * The wiki's visual editor (MDXEditor): a formatting toolbar, tables, links,
 * code blocks, and Markdown shortcuts as you type (`#`, `-`, `**`), saving
 * plain Markdown. The toolbar's right-hand toggle shows the raw Markdown, or
 * what's changed since the page was last saved. HTML tags stay as text.
 */
export const RichEditor = forwardRef<
  RichEditorHandle,
  { markdown: string; savedMarkdown: string; circleId: string; pageId: string; onChange: (markdown: string) => void; onError: () => void }
>(function RichEditor({ markdown, savedMarkdown, circleId, pageId, onChange, onError }, ref) {
  const editor = useRef<MDXEditorMethods>(null);
  useImperativeHandle(ref, () => ({
    setMarkdown: (value) => editor.current?.setMarkdown(value),
    focus: () => editor.current?.focus(),
  }));
  // Put the link where the cursor was, and carry on typing after it.
  const insertLink = (text: string) => {
    editor.current?.focus(() => editor.current?.insertMarkdown(text), { preventScroll: true });
  };
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
        directivesPlugin({ directiveDescriptors: [detailsDirective, textDirectives, otherDirectives] }),
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
              <LinkPicker compact circleId={circleId} pageId={pageId} onPick={insertLink} />
              <Separator />
              <InsertTable />
              <InsertThematicBreak />
              <InsertCodeBlock />
              <ButtonWithTooltip
                title="Collapsible section"
                onClick={() => editor.current?.insertMarkdown(':::details{title="Details"}\nWhat this section hides.\n:::')}
              >
                <ChevronsUpDown className="h-5 w-5" />
              </ButtonWithTooltip>
            </DiffSourceToggleWrapper>
          ),
        }),
      ]}
    />
  );
});
