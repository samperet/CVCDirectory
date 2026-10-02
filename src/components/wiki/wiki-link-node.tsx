"use client";

import { useContext, useEffect, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PhrasingContent, Text } from "mdast";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  DecoratorNode,
  TextNode,
  type ElementNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import {
  addComposerChild$,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor";
import { WIKI_LINK, normalizeWikiLinks, parseWikiLink } from "@/lib/wiki/links";
import {
  docFileUrl,
  findDoc,
  pageTitled,
  useDocTitles,
  wikiPagesQuery,
} from "@/components/wiki/link-data";
import { WikiCircleContext } from "@/components/wiki/poll-block";
import { WikiTag } from "@/components/wiki/wiki-tag";
import { useCircles } from "@/components/directory/use-directory";

/**
 * Wiki links in the visual editor, shown as tags: a `[[…]]` link is one
 * node — drawn like the tag on the page, opened in a new tab when clicked,
 * and deleted as a whole — and goes back to `[[…]]` text when the page is
 * saved, so the Markdown is unchanged.
 */

type SerializedWikiLinkNode = Spread<
  { target: string; label?: string; format?: number },
  SerializedLexicalNode
>;

// Lexical's text format bits, as the editor uses them.
const BOLD = 1;
const ITALIC = 2;

/** What a tag shows, worked out like the page does: the page, the document, or nothing yet. */
function EditorWikiTag({
  target,
  label,
  format = 0,
}: {
  target: string;
  label?: string;
  format?: number;
}) {
  const styled = (tag: JSX.Element) =>
    format & (BOLD | ITALIC) ? (
      <span className={(format & BOLD ? "font-bold " : "") + (format & ITALIC ? "italic" : "")}>
        {tag}
      </span>
    ) : (
      tag
    );
  const wiki = useContext(WikiCircleContext);
  const circleId = wiki?.circleId ?? "";
  const circles = useCircles();
  const link = circles ? parseWikiLink(target, circles) : null;
  const pages = useQuery({ ...wikiPagesQuery(), enabled: link?.kind === "page" });
  const docs = useDocTitles(link?.kind === "doc").data;
  const text = label?.trim() || link?.title || target;
  if (!link) return styled(<WikiTag kind="pending" label={text} />);
  if (link.kind === "doc") {
    if (!docs) return styled(<WikiTag kind="pending" label={text} />);
    const doc = findDoc(docs, link.title, link.circleId, circleId);
    return styled(
      doc ? (
        <WikiTag
          kind="doc"
          label={text}
          href={docFileUrl(doc.id)}
          circleName={doc.circleName}
          newTab
        />
      ) : (
        <WikiTag kind="doc-missing" label={text} />
      )
    );
  }
  if (pages.isError) return styled(<WikiTag kind="missing" label={text} />);
  if (!pages.data) return styled(<WikiTag kind="pending" label={text} />);
  const page = pageTitled(pages.data.pages, link.title);
  return styled(
    page ? (
      <WikiTag kind="page" label={text} href={`/wiki/${page.slug}`} newTab />
    ) : (
      <WikiTag
        kind="missing"
        label={text}
        href={`/documents?new=${encodeURIComponent(link.title)}`}
        newTab
      />
    )
  );
}

export class WikiLinkNode extends DecoratorNode<JSX.Element> {
  __target: string;
  __label: string | undefined;
  /** Bold or italic, from the text around it. */
  __format: number;

  static getType() {
    return "wiki-link";
  }

  static clone(node: WikiLinkNode) {
    return new WikiLinkNode(node.__target, node.__label, node.__format, node.__key);
  }

  static importJSON(json: SerializedWikiLinkNode) {
    return $createWikiLinkNode(json.target, json.label, json.format);
  }

  constructor(target: string, label?: string, format = 0, key?: NodeKey) {
    super(key);
    this.__target = target;
    this.__label = label;
    this.__format = format;
  }

  exportJSON(): SerializedWikiLinkNode {
    return {
      type: "wiki-link",
      version: 1,
      target: this.__target,
      ...(this.__label ? { label: this.__label } : {}),
      ...(this.__format ? { format: this.__format } : {}),
    };
  }

  createDOM() {
    const element = document.createElement("span");
    element.className = "wiki-link-node";
    element.contentEditable = "false";
    return element;
  }

  updateDOM() {
    return false;
  }

  isInline() {
    return true;
  }

  /** The link as it's written in the page. */
  markdown() {
    return `[[${this.__target}${this.__label ? `|${this.__label}` : ""}]]`;
  }

  getTextContent() {
    return this.markdown();
  }

  decorate() {
    return <EditorWikiTag target={this.__target} label={this.__label} format={this.__format} />;
  }
}

export function $createWikiLinkNode(target: string, label?: string, format = 0) {
  return new WikiLinkNode(target.trim(), label?.trim() || undefined, format & (BOLD | ITALIC));
}

export function $isWikiLinkNode(node: LexicalNode | null | undefined): node is WikiLinkNode {
  return node instanceof WikiLinkNode;
}

/** `[[Page]]` text from the page's Markdown becomes tags (keeping the bold or italic around it). */
const importVisitor: MdastImportVisitor<Text> = {
  testNode: (node) =>
    node.type === "text" && /\[\[[^\]\n]+\]\]/.test(normalizeWikiLinks((node as Text).value)),
  priority: 10,
  visitNode({ mdastNode, lexicalParent, actions }) {
    const value = normalizeWikiLinks(mdastNode.value);
    const parent = lexicalParent as ElementNode;
    const format = actions.getParentFormatting();
    const style = actions.getParentStyle();
    const addText = (text: string) => {
      if (!text) return;
      const node = $createTextNode(text);
      node.setFormat(format);
      if (style) node.setStyle(style);
      parent.append(node);
    };
    let last = 0;
    for (const match of Array.from(value.matchAll(WIKI_LINK))) {
      addText(value.slice(last, match.index));
      parent.append($createWikiLinkNode(match[1], match[2], format));
      last = (match.index ?? 0) + match[0].length;
    }
    addText(value.slice(last));
  },
};

/** …and tags go back to `[[Page]]` text when the page is saved. */
const exportVisitor: LexicalExportVisitor<WikiLinkNode, PhrasingContent> = {
  testLexicalNode: $isWikiLinkNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    // Inside bold or italic, it's written inside them (and joins the text around it).
    let node: PhrasingContent = { type: "text", value: lexicalNode.markdown() };
    if (lexicalNode.__format & ITALIC) node = { type: "emphasis", children: [node] };
    if (lexicalNode.__format & BOLD) node = { type: "strong", children: [node] };
    actions.appendToParent(mdastParent, node);
  },
};

const TYPED_LINK = /\[\[([^\]|\n]{1,240})(?:\|([^\]\n]{1,120}))?\]\]/;

/** A link typed by hand becomes a tag as soon as its closing `]]` is typed. */
function TypedLinks() {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerNodeTransform(TextNode, (node) => {
        if (!node.isSimpleText() || node.hasFormat("code")) return;
        const text = node.getTextContent();
        const match = TYPED_LINK.exec(text);
        if (!match) return;
        const start = match.index;
        const end = start + match[0].length;
        const selection = $getSelection();
        const caretHere = $isRangeSelection(selection) && selection.anchor.key === node.getKey();
        const pieces = node.splitText(start, end);
        const linkText = pieces[start === 0 ? 0 : 1];
        const link = $createWikiLinkNode(match[1], match[2], linkText.getFormat());
        linkText.replace(link);
        if (caretHere) link.selectNext(0, 0);
      }),
    [editor]
  );
  return null;
}

/** The tags, as an editor plugin. */
export const wikiLinkPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: WikiLinkNode,
      [addImportVisitor$]: importVisitor,
      [addExportVisitor$]: exportVisitor,
      [addComposerChild$]: TypedLinks,
    });
  },
});
