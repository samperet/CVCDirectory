"use client";

import "@mdxeditor/editor/style.css";
import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronsUpDown,
  Eraser,
  FilePlus2,
  Highlighter,
  LayoutList,
  Mic,
  Users,
  X,
} from "lucide-react";
import {
  $isDirectiveNode,
  BoldItalicUnderlineToggles,
  ButtonOrDropdownButton,
  ButtonWithTooltip,
  CreateLink,
  type DirectiveDescriptor,
  type DirectiveEditorProps,
  GenericDirectiveEditor,
  InsertImage,
  InsertTable,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  NestedLexicalEditor,
  Separator,
  UndoRedo,
  activeEditor$,
  allowedHeadingLevels$,
  convertSelectionToNode$,
  currentBlockType$,
  insertMarkdown$,
  Select as ToolbarSelect,
  usePublisher,
  codeBlockPlugin,
  codeMirrorPlugin,
  directivesPlugin,
  editorInFocus$,
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
  useCellValue,
  useLexicalNodeRemove,
  useMdastNodeUpdater,
} from "@mdxeditor/editor";
import { normalizeWikiLinks, parseWikiLink, protectWikiLinks } from "@/lib/wiki/links";
import { mentionPlugin } from "@/components/wiki/mention-menu";
import { wikiLinkPlugin } from "@/components/wiki/wiki-link-node";
import { captureCursor, editorBridgePlugin, restoreCursor } from "@/components/wiki/editor-cursor";
import { WikiCircleContext, wikiPollsQuery } from "@/components/wiki/poll-block";
import { NewPollDialog } from "@/components/polls/new-poll-dialog";
import { AddDocumentDialog } from "@/components/wiki/add-document-dialog";
import { EmbedPageDialog } from "@/components/wiki/embed-page-dialog";
import { EmbedBlock } from "@/components/wiki/embed-block";
import { pageTitled, wikiPagesQuery } from "@/components/wiki/link-data";
import { featureEnabled } from "@/lib/circles/features";
import { uploadWikiImage } from "@/lib/image-client";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLES,
  highlightColor,
  type HighlightColor,
} from "@/lib/wiki/colors";
import { cn } from "@/lib/utils";
import {
  MARK_ACTION,
  contextMenuPlugin,
  highlightMarkdown,
  type MarkAction,
} from "@/components/wiki/editor-context-menu";

export interface RichEditorHandle {
  /** Replace the text (e.g. restoring a saved draft). */
  setMarkdown: (markdown: string) => void;
  /** Replace the text with a merged version, keeping the cursor in its block (`mineAt` maps old blocks to new). */
  replace: (markdown: string, mineAt: number[] | null) => void;
  focus: () => void;
}

/** A collapsible section (`:::details{title="…"}`) in the editor: its title, and what it hides. */
const isLabel = (child: ContainerDirective["children"][number]) =>
  !!(child.data as { directiveLabel?: boolean } | undefined)?.directiveLabel;
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
      <div
        className="flex items-center gap-2 border-b border-border px-3 py-1.5"
        contentEditable={false}
      >
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          value={title}
          onChange={(event) =>
            update({
              attributes: { ...mdastNode.attributes, title: event.target.value },
              children: mdastNode.children.filter((child) => !isLabel(child)),
            })
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
            children: [
              ...node.children.filter(isLabel),
              ...(children as ContainerDirective["children"]),
            ],
          })}
        />
      </div>
    </div>
  );
}

export const detailsDirective: DirectiveDescriptor<ContainerDirective> = {
  name: "details",
  type: "containerDirective",
  testNode: (node) => node.type === "containerDirective" && node.name === "details",
  attributes: ["title"],
  hasChildren: true,
  Editor: DetailsEditor,
};

/** A callout (`:::callout`) while editing: its words, edited in place, inside the dotted line. */
function CalloutEditor() {
  return (
    <div className="wiki-callout relative" data-callout>
      <span
        contentEditable={false}
        className="absolute -top-2.5 left-4 select-none bg-white px-1.5 text-[11px] font-medium uppercase tracking-wide text-muted"
      >
        Callout
      </span>
      <NestedLexicalEditor<ContainerDirective>
        block
        getContent={(node) => node.children.filter((child) => !isLabel(child))}
        getUpdatedMdastNode={(node, children) => ({
          ...node,
          children: children as ContainerDirective["children"],
        })}
      />
    </div>
  );
}

export const calloutDirective: DirectiveDescriptor<ContainerDirective> = {
  name: "callout",
  type: "containerDirective",
  testNode: (node) => node.type === "containerDirective" && node.name === "callout",
  attributes: [],
  hasChildren: true,
  Editor: CalloutEditor,
};

/** A block's words as Markdown, keeping bold, italic, struck-through and code words. */
function $blockMarkdown(block: LexicalNode): string {
  const parts: string[] = [];
  const walk = (node: LexicalNode) => {
    if ($isTextNode(node)) {
      const text = node.getTextContent().replace(/[\\`*_[\]<>~|]/g, "\\$&");
      if (!text.trim()) return parts.push(text);
      const format = node.getFormat();
      const marks = [
        format & CODE ? "`" : "",
        format & BOLD ? "**" : "",
        format & ITALIC ? "*" : "",
        format & STRIKETHROUGH ? "~~" : "",
      ].join("");
      const closing = marks.split("").reverse().join("");
      const [, before, words, after] = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      parts.push(`${before}${marks}${words}${closing}${after}`);
    } else if ($isLineBreakNode(node)) {
      parts.push("  \n");
    } else if ($isElementNode(node)) {
      node.getChildren().forEach(walk);
    } else {
      parts.push(node.getTextContent());
    }
  };
  walk(block);
  return parts.join("").trim();
}

/**
 * The toolbar's **Style**: Paragraph, Quote, Callout, or a heading, for the
 * block the cursor is in. A callout takes in the selected blocks' words
 * (keeping bold and italic) and sets them apart; the others are the editor's own.
 */
export function StyleSelect() {
  const convertSelectionToNode = usePublisher(convertSelectionToNode$);
  const insertMarkdown = usePublisher(insertMarkdown$);
  const current = useCellValue(currentBlockType$);
  const levels = useCellValue(allowedHeadingLevels$);
  const active = useCellValue(activeEditor$);
  // The blocks last selected (choosing from the menu takes the focus, and the selection, away).
  const selected = useRef<string[]>([]);
  useEffect(() => {
    if (!active) return;
    return active.registerUpdateListener(({ editorState }) =>
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const keys: string[] = [];
        for (const node of selection.getNodes()) {
          const block = $isRootOrShadowRoot(node) ? null : node.getTopLevelElement();
          if (block && !keys.includes(block.getKey())) keys.push(block.getKey());
        }
        selected.current = keys;
      })
    );
  }, [active]);
  const items: { label: string; value: string }[] = [
    { label: "Paragraph", value: "paragraph" },
    { label: "Quote", value: "quote" },
    { label: "Callout", value: "callout" },
    ...levels.map((level) => ({ label: `Heading ${level}`, value: `h${level}` })),
  ];
  return (
    <ToolbarSelect<string>
      value={current}
      triggerTitle="Style"
      placeholder="Style"
      items={items}
      onChange={(value) => {
        if (value === "paragraph") convertSelectionToNode(() => $createParagraphNode());
        else if (value === "quote") convertSelectionToNode(() => $createQuoteNode());
        else if (/^h[1-6]$/.test(value))
          convertSelectionToNode(() => $createHeadingNode(value as "h1" | "h2" | "h3"));
        else if (value === "callout" && active) {
          const live = () =>
            selected.current
              .map((key) => $getNodeByKey(key))
              .filter((node): node is LexicalNode => !!node && node.isAttached());
          // Read the words now; the editor applies changes after this returns.
          const words = active
            .getEditorState()
            .read(() => live().map($blockMarkdown).filter(Boolean).join("\n\n"));
          active.update(() => {
            const blocks = live();
            // The callout goes where these blocks were.
            const place = $createParagraphNode();
            if (blocks[0]) blocks[0].insertBefore(place);
            blocks.forEach((block) => block.remove());
            place.select();
          });
          insertMarkdown(`:::callout\n${words || "Write the callout here."}\n:::`);
        }
      }}
    />
  );
}

/** A poll in the page, while editing: its question and choices, and a × to take it out. */
function PollDirectiveEditor({ mdastNode }: { mdastNode: LeafDirective }) {
  const wiki = useContext(WikiCircleContext);
  const remove = useLexicalNodeRemove();
  const { data } = useQuery(wikiPollsQuery());
  const id = (mdastNode.attributes?.id ?? "").toLowerCase();
  const entry = data?.polls.find((poll) => poll.id === id);
  return (
    <div
      className="my-2 flex items-start gap-2 rounded-lg border border-border bg-accent/40 px-3 py-2"
      contentEditable={false}
    >
      <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {entry ? entry.question : data ? "A poll that's no longer available" : "Poll"}
        </p>
        {entry ? (
          <p className="truncate text-xs text-muted">
            {entry.poll.options.map((option) => option.text).join(" · ")}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={remove}
        className="rounded p-1 text-muted hover:bg-accent hover:text-foreground"
        aria-label="Take the poll out of the page"
        title="Take out of the page"
      >
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

/** Another page (or a section of it) shown in this one: what it is, a preview on request, and a × to take it out. */
function EmbedDirectiveEditor({ mdastNode }: { mdastNode: LeafDirective }) {
  const wiki = useContext(WikiCircleContext);
  const remove = useLexicalNodeRemove();
  const [preview, setPreview] = useState(false);
  const target = mdastNode.attributes?.page ?? "";
  const section = mdastNode.attributes?.section ?? undefined;
  const circles = useCircles();
  const link = circles ? parseWikiLink(target, circles) : null;
  const found = pageTitled(useQuery(wikiPagesQuery()).data?.pages, link?.title ?? "");
  const circle = circles?.find((entry) => entry.id === found?.keeper);
  return (
    <div
      className="my-2 rounded-lg border border-border bg-accent/30 px-3 py-2"
      contentEditable={false}
    >
      <div className="flex items-start gap-2">
        <LayoutList className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {link?.title ?? target}
            {section ? <span className="font-normal text-muted"> › {section}</span> : null}
          </p>
          <p className="text-xs text-muted">
            Shown here{circle && circle.id !== wiki?.circleId ? `, from ${circle.name}` : ""} ·{" "}
            <button
              type="button"
              className="font-medium text-secondary-foreground hover:underline"
              onClick={() => setPreview(!preview)}
              aria-expanded={preview}
            >
              {preview ? "Hide preview" : "Show preview"}
            </button>
          </p>
        </div>
        {found ? (
          <a
            href={`/wiki/${found.slug}`}
            target="_blank"
            rel="noopener"
            className="rounded p-1 text-muted hover:bg-accent hover:text-foreground"
            aria-label="Open the page in a new tab"
            title="Open in a new tab"
          >
            <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={remove}
          className="rounded p-1 text-muted hover:bg-accent hover:text-foreground"
          aria-label="Take the embedded page out"
          title="Take out of the page"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {preview ? (
        <div className="mt-2 max-h-80 overflow-y-auto rounded-md bg-white/70 px-3 py-2">
          <EmbedBlock target={target} section={section} />
        </div>
      ) : null}
    </div>
  );
}

const embedDirective: DirectiveDescriptor<LeafDirective> = {
  name: "embed",
  type: "leafDirective",
  testNode: (node) => node.type === "leafDirective" && node.name === "embed",
  attributes: ["page", "section"],
  hasChildren: false,
  Editor: EmbedDirectiveEditor,
};

// Lexical's text format bits, for what a highlight can hold.
const BOLD = 1;
const ITALIC = 2;
const STRIKETHROUGH = 4;
const CODE = 16;

type Phrasing = { type: string; value?: string; children?: Phrasing[] };

/** Text nodes for a highlight's words, keeping bold, italic, and code (for taking the highlight off). */
function $textNodesOf(children: Phrasing[], format = 0): LexicalNode[] {
  return children.flatMap((child) => {
    if (child.type === "strong") return $textNodesOf(child.children ?? [], format | BOLD);
    if (child.type === "emphasis") return $textNodesOf(child.children ?? [], format | ITALIC);
    if (typeof child.value === "string") {
      const node = $createTextNode(child.value);
      node.setFormat(child.type === "inlineCode" ? format | CODE : format);
      return [node];
    }
    return $textNodesOf(child.children ?? [], format);
  });
}

/**
 * Highlighted text while editing (`:mark[words]{color="green"}`): the words
 * stay editable in place, on their colour. While the cursor is in them, the
 * palette and an eraser show just above, to change the colour or take the
 * highlight off. A highlight is one run of text, so Enter does nothing in it.
 */
function MarkEditor({ mdastNode, lexicalNode, parentEditor }: DirectiveEditorProps<TextDirective>) {
  const color = highlightColor(mdastNode.attributes?.color);
  // What's been typed in the highlight is saved into the page as it loses focus: do that first.
  const settle = () => (document.activeElement as HTMLElement | null)?.blur();
  const change = (apply: (node: ReturnType<typeof $getNodeByKey>) => void) => {
    settle();
    parentEditor.update(() => apply($getNodeByKey(lexicalNode.getKey())));
  };
  const recolor = (next: HighlightColor) =>
    change((node) => {
      if ($isDirectiveNode(node))
        node.setMdastNode({
          ...(node.getMdastNode() as TextDirective),
          attributes: { color: next },
        });
    });
  const unwrap = () =>
    change((node) => {
      if (!$isDirectiveNode(node)) return;
      const words = $textNodesOf(node.getMdastNode().children as Phrasing[]);
      if (!words.length) return node.remove();
      node.replace(words[0]);
      words.slice(1).reduce((previous, next) => previous.insertAfter(next), words[0]);
    });
  const keep = (event: React.MouseEvent) => event.preventDefault();
  // The right-click menu changes or removes this highlight through a DOM event.
  const host = useRef<HTMLSpanElement>(null);
  const actions = useRef({ recolor, unwrap });
  actions.current = { recolor, unwrap };
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const onAction = (event: Event) => {
      const action = (event as CustomEvent<MarkAction>).detail;
      if (action === "remove") actions.current.unwrap();
      else actions.current.recolor(action);
    };
    element.addEventListener(MARK_ACTION, onAction);
    return () => element.removeEventListener(MARK_ACTION, onAction);
  }, []);
  return (
    <span
      ref={host}
      data-mark-host={color}
      className="group/mark relative"
      onKeyDownCapture={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <mark className={`wiki-mark hl-${color}`} data-highlight={color}>
        <NestedLexicalEditor<TextDirective>
          getContent={(node) => node.children}
          getUpdatedMdastNode={(node, children) => ({
            ...node,
            children: children as TextDirective["children"],
          })}
          contentEditableProps={{ className: "wiki-mark-editor" }}
        />
      </mark>
      <span
        contentEditable={false}
        className="absolute bottom-full left-0 z-30 mb-1 hidden items-center gap-1 rounded-full border border-border bg-white px-1.5 py-1 shadow-elev group-focus-within/mark:flex"
        data-highlight-tools
      >
        {HIGHLIGHT_COLORS.map((name) => (
          <button
            key={name}
            type="button"
            title={HIGHLIGHT_STYLES[name].label}
            aria-label={`${HIGHLIGHT_STYLES[name].label} highlight`}
            aria-pressed={name === color}
            onMouseDown={keep}
            onClick={() => recolor(name)}
            className={cn(
              "h-5 w-5 rounded-full border border-black/10",
              `hl-${name}`,
              name === color && "ring-2 ring-foreground/50 ring-offset-1"
            )}
          />
        ))}
        <button
          type="button"
          title="No highlight"
          aria-label="Remove highlight"
          onMouseDown={keep}
          onClick={unwrap}
          className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-accent hover:text-foreground"
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    </span>
  );
}

export const markDirective: DirectiveDescriptor<TextDirective> = {
  name: "mark",
  type: "textDirective",
  testNode: (node) => node.type === "textDirective" && node.name === "mark",
  attributes: ["color"],
  hasChildren: true,
  Editor: MarkEditor,
};

/**
 * The toolbar's highlighter: choose a colour, and the selected words (within
 * one paragraph) are highlighted in it. Inside a highlight, its own palette
 * (just above it) changes it instead.
 */
export function HighlightButton({ onApply }: { onApply: (markdown: string) => void }) {
  const active = useCellValue(activeEditor$);
  const inFocus = useCellValue(editorInFocus$);
  const { toast } = useToast();
  return (
    <ButtonOrDropdownButton<HighlightColor>
      title="Highlight"
      items={HIGHLIGHT_COLORS.map((name) => ({
        value: name,
        label: (
          <span className="flex items-center gap-2" data-highlight-choice={name}>
            <span className={`h-3.5 w-3.5 rounded-sm border border-black/10 hl-${name}`} />
            {HIGHLIGHT_STYLES[name].label}
          </span>
        ),
      }))}
      onChoose={(color) => {
        const root = inFocus?.rootNode;
        if (root && $isDirectiveNode(root) && root.getMdastNode().name === "mark") {
          toast({ title: "Change this highlight with the colours just above it" });
          return;
        }
        const result = highlightMarkdown(active, color);
        if ("problem" in result) toast({ title: result.problem });
        else onApply(result.markdown);
      }}
    >
      <Highlighter className="h-5 w-5" />
    </ButtonOrDropdownButton>
  );
}

/** Text like "Contact:Lynn" parses as a directive; show it as the text it is. */
export const textDirectives: DirectiveDescriptor<TextDirective> = {
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
export const otherDirectives: DirectiveDescriptor = {
  name: "*",
  testNode: () => true,
  attributes: [],
  hasChildren: true,
  Editor: GenericDirectiveEditor,
};

/**
 * The wiki's visual editor (MDXEditor): a simple formatting toolbar (with a
 * highlighter), a right-click menu (`editor-context-menu.tsx`), lists, tables,
 * photos, collapsible sections, polls, and Markdown shortcuts as you type
 * (`#`, `-`, `**`), saving plain Markdown. Typing @ links a page or
 * a document — or a new page. HTML tags stay as text.
 */
export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    markdown: string;
    /** The circle that keeps the page. */
    circleId: string;
    circleName: string;
    pageId: string;
    /** The page's address (for its photos and polls). */
    pageSlug: string;
    onChange: (markdown: string) => void;
    onError: () => void;
    /** A new page was linked with @: it's made when this page is saved. */
    onCreatePage: (title: string) => void;
    /** The same handle as the ref (refs don't pass through a lazily loaded component). */
    control?: MutableRefObject<RichEditorHandle | null>;
    /** The toolbar's **Transcribe**: open the transcript beside the page. */
    onTranscribe?: () => void;
    /** The toolbar's **Who's present**: choose the people present (meeting notes). */
    onPresent?: () => void;
  }
>(function RichEditor(
  {
    markdown,
    circleId,
    circleName,
    pageId,
    pageSlug,
    onChange,
    onError,
    onCreatePage,
    control,
    onTranscribe,
    onPresent,
  },
  ref
) {
  // The toolbar is set up once, so it reaches these through a ref.
  const meeting = useRef({ onTranscribe, onPresent });
  meeting.current = { onTranscribe, onPresent };
  const editor = useRef<MDXEditorMethods>(null);
  const lexical = useRef<LexicalEditor | null>(null);
  const [polling, setPolling] = useState(false);
  const [addingDocument, setAddingDocument] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  // Documents go into the circle's documents, so only while it has them turned on.
  const documentsOn = featureEnabled(
    useCircles()?.find((circle) => circle.id === circleId),
    "documents"
  );
  const wiki = useMemo(
    () => ({ circleId, circleName, pageSlug }),
    [circleId, circleName, pageSlug]
  );
  // The plugin is set up once, so it reads the latest callback through a ref.
  const createRef = useRef(onCreatePage);
  createRef.current = onCreatePage;
  const { toast } = useToast();
  // Photos chosen from the toolbar, pasted, or dropped in go to the circle's wiki photos.
  const uploadPhoto = async (file: File) => {
    try {
      return await uploadWikiImage(pageSlug, file);
    } catch (error) {
      toast({
        title: "Could not add the photo",
        description: (error as Error).message,
        variant: "destructive",
      });
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
    editor.current?.focus(() => editor.current?.insertMarkdown(protectWikiLinks(text)), {
      preventScroll: true,
    });
  };
  /** A link in the running text, with a space before it unless one's there already (inserted Markdown loses its spaces). */
  const insertLink = (link: string) => {
    editor.current?.focus(
      () => {
        lexical.current?.update(
          () => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
            const { anchor } = selection;
            const before =
              anchor.type === "text" ? anchor.getNode().getTextContent()[anchor.offset - 1] : "";
            if (before && !/\s/.test(before)) selection.insertText(" ");
          },
          { discrete: true }
        );
        editor.current?.insertMarkdown(protectWikiLinks(link));
      },
      { preventScroll: true }
    );
  };
  return (
    <WikiCircleContext.Provider value={wiki}>
      <MDXEditor
        ref={editor}
        markdown={protectWikiLinks(markdown)}
        onChange={(value) => onChange(normalizeWikiLinks(value))}
        onError={onError}
        suppressHtmlProcessing
        className="wiki-editor"
        contentEditableClassName="wiki-prose document-body"
        placeholder="Start writing — type @ to link a page or document, # for a heading, - for a list…"
        plugins={[
          headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          imagePlugin({
            imageUploadHandler: uploadPhoto,
            disableImageResize: true,
            disableImageSettingsButton: true,
          }),
          codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
          codeMirrorPlugin({
            codeBlockLanguages: { "": "Plain text", js: "JavaScript", py: "Python", sh: "Shell" },
            autoLoadLanguageSupport: false,
          }),
          markdownShortcutPlugin(),
          directivesPlugin({
            directiveDescriptors: [
              detailsDirective,
              calloutDirective,
              pollDirective,
              embedDirective,
              markDirective,
              textDirectives,
              otherDirectives,
            ],
          }),
          wikiLinkPlugin(),
          editorBridgePlugin({ target: lexical }),
          contextMenuPlugin(),
          mentionPlugin({
            circleId,
            circleName,
            pageId,
            onCreatePage: (title) => createRef.current(title),
          }),
          toolbarPlugin({
            toolbarClassName: "wiki-toolbar",
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <StyleSelect />
                <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
                <HighlightButton onApply={(markdown) => editor.current?.insertMarkdown(markdown)} />
                <Separator />
                <ListsToggle options={["bullet", "number", "check"]} />
                <Separator />
                <CreateLink />
                <Separator />
                <InsertImage />
                {documentsOn ? (
                  <ButtonWithTooltip title="Add a document" onClick={() => setAddingDocument(true)}>
                    <FilePlus2 className="h-5 w-5" />
                  </ButtonWithTooltip>
                ) : null}
                <ButtonWithTooltip
                  title="Show or link another page"
                  onClick={() => setEmbedding(true)}
                >
                  <LayoutList className="h-5 w-5" />
                </ButtonWithTooltip>
                <InsertTable />
                <ButtonWithTooltip
                  title="Collapsible section"
                  onClick={() =>
                    insert(':::details{title="Details"}\nWhat this section hides.\n:::')
                  }
                >
                  <ChevronsUpDown className="h-5 w-5" />
                </ButtonWithTooltip>
                <ButtonWithTooltip title="Add a poll" onClick={() => setPolling(true)}>
                  <BarChart3 className="h-5 w-5" />
                </ButtonWithTooltip>
                <Separator />
                <ButtonWithTooltip
                  title="Who's present"
                  onClick={() => meeting.current.onPresent?.()}
                >
                  <Users className="h-5 w-5" />
                </ButtonWithTooltip>
                <ButtonWithTooltip
                  title="Record a transcript"
                  onClick={() => meeting.current.onTranscribe?.()}
                >
                  <Mic className="h-5 w-5" />
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
            insertLink(link);
          }}
        />
      ) : null}
      {embedding ? (
        <EmbedPageDialog
          circle={{ id: circleId, name: circleName }}
          pageId={pageId}
          onClose={() => setEmbedding(false)}
          onChosen={(markdown, kind) => {
            setEmbedding(false);
            if (kind === "link") insertLink(markdown);
            else insert(markdown);
          }}
        />
      ) : null}
      {polling ? (
        <NewPollDialog
          circle={{ id: circleId, name: circleName }}
          pageSlug={pageSlug}
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
