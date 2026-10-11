"use client";

import { useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ArrowUpRight, BarChart3, ChevronDown, Handshake, LayoutList, X } from "lucide-react";
import { parseWikiLink } from "@/lib/wiki/links";
import { rawMarkdown } from "@/lib/wiki/prose";
import { WikiCircleContext, wikiPollsQuery } from "@/components/wiki/poll-block";
import { proposalQuery } from "@/components/proposals/data";
import { ProposalStatusPill } from "@/components/proposals/proposal-bits";
import { EmbedBlock } from "@/components/wiki/embed-block";
import { pageTitled, wikiPagesQuery } from "@/components/wiki/link-data";
import { useCircles } from "@/components/directory/use-directory";

/**
 * How the visual editor shows the page's own blocks (the nodes are in
 * `editor-schema.ts`): a callout and a collapsible section, edited in place;
 * a poll, a proposal and an embedded page, each a card with a × to take it
 * out of the page; and anything the editor doesn't know, as its Markdown.
 */

/** A callout (`:::callout`): its words, edited in place, inside the dotted line. */
export function CalloutView() {
  return (
    <NodeViewWrapper className="wiki-callout relative" data-callout="">
      <span
        contentEditable={false}
        className="absolute -top-2.5 left-4 select-none bg-white px-1.5 text-[11px] font-medium uppercase tracking-wide text-muted"
      >
        Callout
      </span>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

/** A collapsible section (`:::details{title="…"}`): its title, and what it hides. */
export function DetailsView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper className="my-2 rounded-lg border border-border bg-surface" data-details="">
      <div
        className="flex items-center gap-2 border-b border-border px-3 py-1.5"
        contentEditable={false}
      >
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          value={node.attrs.title ?? ""}
          onChange={(event) => updateAttributes({ title: event.target.value })}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Section title (shown when collapsed)"
          aria-label="Collapsible section title"
          className="w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted"
        />
        <span className="shrink-0 text-xs text-muted">Collapsible</span>
      </div>
      <NodeViewContent className="px-3 py-1" />
    </NodeViewWrapper>
  );
}

function RemoveButton({
  onClick,
  label,
  title,
}: {
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded p-1 text-muted hover:bg-accent hover:text-foreground"
      aria-label={label}
      title={title}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/** A poll in the page: its question and choices, and a × to take it out. */
export function PollView({ node, deleteNode }: NodeViewProps) {
  const { data } = useQuery(wikiPollsQuery());
  const id = String(node.attrs.id ?? "").toLowerCase();
  const entry = data?.polls.find((poll) => poll.id === id);
  return (
    <NodeViewWrapper
      className="my-2 flex items-start gap-2 rounded-lg border border-border bg-accent/40 px-3 py-2"
      contentEditable={false}
      data-poll-block={id}
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
      <RemoveButton
        onClick={deleteNode}
        label="Take the poll out of the page"
        title="Take out of the page"
      />
    </NodeViewWrapper>
  );
}

/** A proposal in the page: its title, circle, and where it stands, and a × to take it out. */
export function ProposalView({ node, deleteNode }: NodeViewProps) {
  const id = String(node.attrs.id ?? "").toLowerCase();
  const { data, error } = useQuery({ ...proposalQuery(id), enabled: !!id });
  const proposal = data?.proposal;
  return (
    <NodeViewWrapper
      className="my-2 flex items-start gap-2 rounded-lg border border-border border-l-4 border-l-primary bg-accent/40 px-3 py-2"
      contentEditable={false}
      data-proposal-block={id}
    >
      <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {proposal ? proposal.title : error ? "A proposal that's no longer available" : "Proposal"}
        </p>
        {proposal ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            To {proposal.circleName}
            <ProposalStatusPill
              size="xs"
              status={proposal.status}
              decideOn={proposal.decideOn}
              consentDate={proposal.consent?.meeting.date}
            />
          </p>
        ) : null}
      </div>
      <RemoveButton
        onClick={deleteNode}
        label="Take the proposal out of the page"
        title="Take out of the page (the proposal itself stays)"
      />
    </NodeViewWrapper>
  );
}

/** Another page (or a section of it) shown in this one: what it is, a preview on request, and a × to take it out. */
export function EmbedView({ node, deleteNode }: NodeViewProps) {
  const wiki = useContext(WikiCircleContext);
  const [preview, setPreview] = useState(false);
  const target = String(node.attrs.page ?? "");
  const section = node.attrs.section ? String(node.attrs.section) : undefined;
  const circles = useCircles();
  const link = circles ? parseWikiLink(target, circles) : null;
  const found = pageTitled(useQuery(wikiPagesQuery()).data?.pages, link?.title ?? "");
  const circle = circles?.find((entry) => entry.id === found?.keeper);
  return (
    <NodeViewWrapper
      className="my-2 rounded-lg border border-border bg-accent/30 px-3 py-2"
      contentEditable={false}
      data-embed-block={target}
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
        <RemoveButton
          onClick={deleteNode}
          label="Take the embedded page out"
          title="Take out of the page"
        />
      </div>
      {preview ? (
        <div className="mt-2 max-h-80 overflow-y-auto rounded-md bg-white/70 px-3 py-2">
          <EmbedBlock target={target} section={section} />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

/** Something the editor doesn't know (HTML, a footnote, another directive), shown as its Markdown and kept as it was. */
export function RawBlockView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className="my-2 whitespace-pre-wrap rounded-md border border-dashed border-border px-3 py-2 font-mono text-xs text-muted"
      contentEditable={false}
      data-raw-block=""
      title="Kept as written — change it in the Markdown view"
    >
      {rawMarkdown(node.attrs.mdast)}
    </NodeViewWrapper>
  );
}

export function RawInlineView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" contentEditable={false} data-raw-inline="">
      {rawMarkdown(node.attrs.mdast)}
    </NodeViewWrapper>
  );
}
