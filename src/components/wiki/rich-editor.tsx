"use client";

import "@mdxeditor/editor/style.css";
import { forwardRef, useContext, useImperativeHandle, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { LexicalEditor } from "lexical";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import { useQuery } from "@tanstack/react-query";
import { AtSign, BarChart3, ChevronDown, ChevronsUpDown, FilePlus2, X } from "lucide-react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ButtonWithTooltip,
  CreateLink,
  type DirectiveDescriptor,
  GenericDirectiveEditor,
  InsertImage,
  InsertTable,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  NestedLexicalEditor,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  directivesPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  useLexicalNodeRemove,
  useMdastNodeUpdater,
} from "@mdxeditor/editor";
import { normalizeWikiLinks, protectWikiLinks } from "@/lib/wiki/links";
import { mentionPlugin } from "@/components/wiki/mention-menu";
import { wikiLinkPlugin } from "@/components/wiki/wiki-link-node";
import { captureCursor, editorBridgePlugin, restoreCursor } from "@/components/wiki/editor-cursor";
import { WikiCircleContext, wikiPollsQuery } from "@/components/wiki/poll-block";
import { NewPollDialog } from "@/components/polls/new-poll-dialog";
import { AddDocumentDialog } from "@/components/wiki/add-document-dialog";
import { useCircles } from "@/components/wiki/link-data";
import { featureEnabled } from "@/lib/circles/features";
import { uploadWikiImage } from "@/lib/image-client";
import { useToast } from "@/components/ui/use-toast";

export interface RichEditorHandle {
  /** Replace the text (e.g. restoring a saved draft). */
  setMarkdown: (markdown: string) => void;
  /** Replace the text with a merged version, keeping the cursor in its block (`mineAt` maps old blocks to new). */
  replace: (markdown: string, mineAt: number[] | null) => void;
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

/** A poll in the page, while editing: its question and choices, and a × to take it out. */
function PollDirectiveEditor({ mdastNode }: { mdastNode: LeafDirective }) {
  const wiki = useContext(WikiCircleContext);
  const remove = useLexicalNodeRemove();
  const { data } = useQuery({ ...wikiPollsQuery(wiki?.circleId ?? ""), enabled: !!wiki?.circleId });
  const id = (mdastNode.attributes?.id ?? "").toLowerCase();
  const entry = data?.polls.find((poll) => poll.id === id);
  return (
    <div className="my-2 flex items-start gap-2 rounded-lg border border-border bg-accent/40 px-3 py-2" contentEditable={false}>
      <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{entry ? entry.question : data ? "A poll that's no longer available" : "Poll"}</p>
        {entry ? <p className="truncate text-xs text-muted">{entry.poll.options.map((option) => option.text).join(" · ")}</p> : null}
      </div>
      <button type="button" onClick={remove} className="rounded p-1 text-muted hover:bg-accent hover:text-foreground" aria-label="Take the poll out of the page" title="Take out of the page">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const pollDirective: DirectiveDescriptor<LeafDirective> = {
  name: "poll",
  type: "leafDirective",
  testNode: (node) => node.type === "leafDirective" && node.name === "poll",
  attributes: ["id"],
  hasChildren: false,
  Editor: PollDirectiveEditor,
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
 * The wiki's visual editor (MDXEditor): a simple formatting toolbar, lists,
 * tables, photos, collapsible sections, polls, and Markdown shortcuts as
 * you type (`#`, `-`, `**`), saving plain Markdown. Typing @ links a page or
 * a document — or a new page. HTML tags stay as text.
 */
export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    markdown: string;
    circleId: string;
    circleName: string;
    pageId: string;
    onChange: (markdown: string) => void;
    onError: () => void;
    /** A new page was linked with @: it's made when this page is saved. */
    onCreatePage: (title: string) => void;
    /** The same handle as the ref (refs don't pass through a lazily loaded component). */
    control?: MutableRefObject<RichEditorHandle | null>;
  }
>(function RichEditor({ markdown, circleId, circleName, pageId, onChange, onError, onCreatePage, control }, ref) {
  const editor = useRef<MDXEditorMethods>(null);
  const lexical = useRef<LexicalEditor | null>(null);
  const [polling, setPolling] = useState(false);
  const [addingDocument, setAddingDocument] = useState(false);
  // Documents go into the circle's documents, so only while it has them turned on.
  const documentsOn = featureEnabled(useCircles()?.find((circle) => circle.id === circleId), "documents");
  const wiki = useMemo(() => ({ circleId, circleName }), [circleId, circleName]);
  // The plugin is set up once, so it reads the latest callback through a ref.
  const createRef = useRef(onCreatePage);
  createRef.current = onCreatePage;
  const { toast } = useToast();
  // Photos chosen from the toolbar, pasted, or dropped in go to the circle's wiki photos.
  const uploadPhoto = async (file: File) => {
    try {
      return await uploadWikiImage(circleId, file);
    } catch (error) {
      toast({ title: "Could not add the photo", description: (error as Error).message, variant: "destructive" });
      throw error;
    }
  };
  const handle: RichEditorHandle = {
    setMarkdown: (value) => editor.current?.setMarkdown(protectWikiLinks(value)),
    replace: (value, mineAt) => {
      const root = lexical.current?.getRootElement();
      const focused = !!root && root.contains(document.activeElement);
      const mark = focused && lexical.current ? captureCursor(lexical.current) : null;
      editor.current?.setMarkdown(protectWikiLinks(value));
      if (lexical.current && mark) restoreCursor(lexical.current, mark, mineAt);
    },
    focus: () => editor.current?.focus(),
  };
  useImperativeHandle(ref, () => handle);
  if (control) control.current = handle;
  const insert = (text: string) => {
    editor.current?.focus(() => editor.current?.insertMarkdown(protectWikiLinks(text)), { preventScroll: true });
  };
  return (
    <WikiCircleContext.Provider value={wiki}>
    <MDXEditor
      ref={editor}
      markdown={protectWikiLinks(markdown)}
      onChange={(value) => onChange(normalizeWikiLinks(value))}
      onError={onError}
      suppressHtmlProcessing
      className="wiki-editor rounded-lg border border-border bg-white"
      contentEditableClassName="wiki-prose min-h-[20rem] px-4 py-3"
      placeholder="Start writing — type @ to link a page or document, # for a heading, - for a list…"
      plugins={[
        headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        imagePlugin({ imageUploadHandler: uploadPhoto, disableImageResize: true, disableImageSettingsButton: true }),
        codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
        codeMirrorPlugin({ codeBlockLanguages: { "": "Plain text", js: "JavaScript", py: "Python", sh: "Shell" }, autoLoadLanguageSupport: false }),
        markdownShortcutPlugin(),
        directivesPlugin({ directiveDescriptors: [detailsDirective, pollDirective, textDirectives, otherDirectives] }),
        wikiLinkPlugin(),
        editorBridgePlugin({ target: lexical }),
        mentionPlugin({ circleId, circleName, pageId, onCreatePage: (title) => createRef.current(title) }),
        toolbarPlugin({
          toolbarClassName: "wiki-toolbar",
          toolbarContents: () => (
            <>
              <UndoRedo />
              <Separator />
              <BlockTypeSelect />
              <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
              <Separator />
              <ListsToggle options={["bullet", "number", "check"]} />
              <Separator />
              <CreateLink />
              <ButtonWithTooltip title="Link a page or document (or type @)" onClick={() => insert(" @")}>
                <AtSign className="h-5 w-5" />
              </ButtonWithTooltip>
              <Separator />
              <InsertImage />
              {documentsOn ? (
                <ButtonWithTooltip title="Add a document" onClick={() => setAddingDocument(true)}>
                  <FilePlus2 className="h-5 w-5" />
                </ButtonWithTooltip>
              ) : null}
              <InsertTable />
              <ButtonWithTooltip title="Collapsible section" onClick={() => insert(':::details{title="Details"}\nWhat this section hides.\n:::')}>
                <ChevronsUpDown className="h-5 w-5" />
              </ButtonWithTooltip>
              <ButtonWithTooltip title="Add a poll" onClick={() => setPolling(true)}>
                <BarChart3 className="h-5 w-5" />
              </ButtonWithTooltip>
            </>
          ),
        }),
      ]}
    />
    {addingDocument ? (
      <AddDocumentDialog
        circle={{ id: circleId, name: circleName }}
        onClose={() => setAddingDocument(false)}
        onAdded={(link) => {
          setAddingDocument(false);
          insert(` ${link} `);
        }}
      />
    ) : null}
    {polling ? (
      <NewPollDialog
        circle={{ id: circleId, name: circleName }}
        onClose={() => setPolling(false)}
        onCreated={(poll) => {
          setPolling(false);
          insert(`\n::poll{id="${poll.id}"}\n`);
        }}
      />
    ) : null}
    </WikiCircleContext.Provider>
  );
});
