"use client";

import { Fragment, useMemo } from "react";
import { compareRows, compareText } from "@/lib/wiki/merge";
import type { WikiPageSummary } from "@/lib/wiki/store";
import { cn } from "@/lib/utils";
import { WikiMarkdown } from "@/components/wiki/markdown";

/**
 * Two texts of a page compared, paragraph by paragraph: **side by side**,
 * rows lined up (`compareRows`) — what only the first has, in red; what only
 * the second has, in green; a paragraph each changed, both — or as one
 * column of the changes (`compareText`), what's taken out struck through.
 */

type Shared = { circleId: string; pages: WikiPageSummary[] | undefined };

function Block({
  text,
  tone,
  circleId,
  pages,
}: Shared & { text: string; tone: "same" | "removed" | "added" }) {
  if (tone === "same") return <WikiMarkdown source={text} circleId={circleId} pages={pages} />;
  return (
    <div
      className={cn(
        "rounded-r-lg border-l-4 px-3 py-1",
        tone === "removed" ? "border-red-300 bg-red-50" : "border-primary bg-primary/10"
      )}
      data-change={tone}
    >
      <WikiMarkdown source={text} circleId={circleId} pages={pages} />
    </div>
  );
}

/** The two side by side, under their names. */
export function SideBySide({
  before,
  after,
  beforeLabel,
  afterLabel,
  circleId,
  pages,
}: Shared & { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const rows = useMemo(() => compareRows(before, after), [before, after]);
  const changed = rows.filter((row) => row.change !== "same").length;
  return (
    <div className="flex flex-col gap-2" data-side-by-side>
      <p className="text-xs text-muted">
        {changed
          ? `${changed} ${changed === 1 ? "place differs" : "places differ"}`
          : "They're the same."}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <p className="border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {beforeLabel}
        </p>
        <p className="border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {afterLabel}
        </p>
        {rows.map((row, index) => (
          <Fragment key={index}>
            <div className="min-w-0" data-row={row.change}>
              {row.before === null ? null : (
                <Block
                  text={row.before}
                  tone={row.change === "same" ? "same" : "removed"}
                  circleId={circleId}
                  pages={pages}
                />
              )}
            </div>
            <div className="min-w-0">
              {row.after === null ? null : (
                <Block
                  text={row.after}
                  tone={row.change === "same" ? "same" : "added"}
                  circleId={circleId}
                  pages={pages}
                />
              )}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** One column: the first text with the second's changes marked. */
export function Changes({
  before,
  after,
  removedLabel,
  addedLabel,
  circleId,
  pages,
}: Shared & { before: string; after: string; removedLabel: string; addedLabel: string }) {
  const blocks = useMemo(() => compareText(before, after), [before, after]);
  const same = blocks.every((block) => block.change === "same");
  return (
    <div className="flex flex-col gap-3" data-changes>
      {same ? (
        <p className="text-xs text-muted">They&apos;re the same.</p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border-l-4 border-red-300 bg-red-50" aria-hidden />
            {removedLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm border-l-4 border-primary bg-primary/10"
              aria-hidden
            />
            {addedLabel}
          </span>
        </p>
      )}
      {blocks.map((block, index) =>
        block.change === "same" ? (
          <WikiMarkdown key={index} source={block.text} circleId={circleId} pages={pages} />
        ) : (
          <div
            key={index}
            className={cn(
              "rounded-r-lg border-l-4 px-3 py-1",
              block.change === "removed"
                ? "border-red-300 bg-red-50 text-muted line-through decoration-red-400/70"
                : "border-primary bg-primary/10"
            )}
            data-change={block.change}
          >
            <span className="sr-only">
              {block.change === "removed" ? "Taken out: " : "Put in: "}
            </span>
            <WikiMarkdown source={block.text} circleId={circleId} pages={pages} />
          </div>
        )
      )}
    </div>
  );
}
