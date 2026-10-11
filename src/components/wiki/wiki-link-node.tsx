"use client";

import { useContext, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { parseWikiLink } from "@/lib/wiki/links";
import {
  docFileUrl,
  findDoc,
  pageTitled,
  useDocTitles,
  wikiPagesQuery,
} from "@/components/wiki/link-data";
import { WikiCircleContext } from "@/components/wiki/poll-block";
import { PersonTag, WikiTag } from "@/components/wiki/wiki-tag";
import { useCircles } from "@/components/directory/use-directory";

/**
 * Wiki links in the visual editor, shown as tags: a `[[…]]` link is one
 * node — drawn like the tag on the page, opened in a new tab when clicked,
 * and deleted as a whole — and goes back to `[[…]]` text when the page is
 * saved (`lib/wiki/prose.ts`), so the Markdown is unchanged. A link typed
 * by hand becomes a tag as soon as its closing `]]` is typed. A resident
 * mentioned with @ is a node too (`personMention`): "@Ada Ash", linking to
 * their directory entry; written `:person[Ada Ash]{#<personId>}`.
 */

/** What a tag shows, worked out like the page does: the page, the document, or nothing yet. */
export function EditorWikiTag({ target, label }: { target: string; label?: string | null }) {
  const wiki = useContext(WikiCircleContext);
  const circleId = wiki?.circleId ?? "";
  const circles = useCircles();
  const link = circles ? parseWikiLink(target, circles) : null;
  const pages = useQuery({ ...wikiPagesQuery(), enabled: link?.kind === "page" });
  const docs = useDocTitles(link?.kind === "doc").data;
  const text = label?.trim() || link?.title || target;
  let tag: JSX.Element;
  if (!link) tag = <WikiTag kind="pending" label={text} />;
  else if (link.kind === "doc") {
    const doc = docs ? findDoc(docs, link.title, link.circleId, circleId) : undefined;
    tag = !docs ? (
      <WikiTag kind="pending" label={text} />
    ) : doc ? (
      <WikiTag
        kind="doc"
        label={text}
        href={docFileUrl(doc.id)}
        circleName={doc.circleName}
        newTab
      />
    ) : (
      <WikiTag kind="doc-missing" label={text} />
    );
  } else if (pages.isError) tag = <WikiTag kind="missing" label={text} />;
  else if (!pages.data) tag = <WikiTag kind="pending" label={text} />;
  else {
    const page = pageTitled(pages.data.pages, link.title);
    tag = page ? (
      <WikiTag kind="page" label={text} href={`/wiki/${page.slug}`} newTab />
    ) : (
      <WikiTag
        kind="missing"
        label={text}
        href={`/documents?new=${encodeURIComponent(link.title)}`}
        newTab
      />
    );
  }
  return tag;
}

function WikiLinkView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="wiki-link-node" contentEditable={false}>
      <EditorWikiTag target={node.attrs.target} label={node.attrs.label} />
    </NodeViewWrapper>
  );
}

/** The link as it's written in the page. */
export const wikiLinkText = (target: string, label?: string | null) =>
  `[[${target}${label ? `|${label}` : ""}]]`;

const TYPED_LINK = /\[\[([^\]|\n]{1,240})(?:\|([^\]\n]{1,120}))?\]\]$/;

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      target: { default: "", rendered: false },
      label: { default: null, rendered: false },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
        getAttrs: (element) => ({
          target: (element as HTMLElement).dataset.wikiLink ?? "",
          label: (element as HTMLElement).dataset.label ?? null,
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": node.attrs.target,
        ...(node.attrs.label ? { "data-label": node.attrs.label } : {}),
      }),
      wikiLinkText(node.attrs.target, node.attrs.label),
    ];
  },
  renderText({ node }) {
    return wikiLinkText(node.attrs.target, node.attrs.label);
  },
  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: TYPED_LINK,
        handler: ({ state, range, match }) => {
          const marks = state.doc.resolve(range.from).marks();
          const link = this.type.create(
            { target: match[1].trim(), label: match[2]?.trim() || null },
            null,
            marks
          );
          state.tr.replaceWith(range.from, range.to, link);
        },
      }),
    ];
  },
});

function PersonView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" contentEditable={false} data-person-mention={node.attrs.id}>
      <PersonTag label={`@${node.attrs.name}`} href={`/directory/${node.attrs.id}`} newTab />
    </NodeViewWrapper>
  );
}

export const PersonMention = Node.create({
  name: "personMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: "", rendered: false },
      name: { default: "", rendered: false },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-person-mention]",
        getAttrs: (element) => ({
          id: (element as HTMLElement).dataset.personMention ?? "",
          name: (element as HTMLElement).textContent?.replace(/^@/, "") ?? "",
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-person-mention": node.attrs.id }),
      `@${node.attrs.name}`,
    ];
  },
  renderText({ node }) {
    return `@${node.attrs.name}`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(PersonView);
  },
});
