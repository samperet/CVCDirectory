"use client";

import { useState } from "react";
import { History as HistoryIcon, RotateCcw, X } from "lucide-react";
import type { WikiPage, WikiPageSummary, WikiVersion } from "@/lib/wiki/store";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm";
import { Changes, SideBySide } from "@/components/wiki/comparison";
import { WikiMarkdown } from "@/components/wiki/markdown";

/**
 * A page's history as the edits that made it, newest first: who changed it
 * and when, and for each — **What changed** (taken out, put in), the page
 * **Before** it, or that **Compared with now**. The history keeps the text
 * each edit replaced (`withVersion` in `lib/wiki/store.ts`), so edit `k`
 * took `history[k]` to `history[k + 1]` (or, for the latest, to the page).
 * Its editors can **Restore** the page as it was before any edit (the
 * current text goes into the history, so that can be undone too).
 */

type View = "changes" | "before" | "now";

export interface PageEdit {
  /** The history entry this edit replaced. */
  index: number;
  by: string;
  at: string;
  before: WikiVersion;
  after: { title: string; body: string };
}

/** The edits a history records, oldest first. */
export function editsOf(
  page: Pick<WikiPage, "title" | "body" | "updatedAt" | "updatedBy">,
  history: WikiVersion[]
): PageEdit[] {
  return history.map((before, index) => {
    const next = history[index + 1];
    return {
      index,
      by: (next?.editedBy ?? page.updatedBy).name,
      at: next?.editedAt ?? page.updatedAt,
      before,
      after: next ? { title: next.title, body: next.body } : { title: page.title, body: page.body },
    };
  });
}

export function PageHistory({
  page,
  history,
  circleId,
  pages,
  canRestore,
  restoring,
  onRestore,
  onClose,
}: {
  page: WikiPage;
  history: WikiVersion[];
  circleId: string;
  pages: WikiPageSummary[] | undefined;
  canRestore: boolean;
  restoring: boolean;
  onRestore: (index: number) => void;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const edits = editsOf(page, history).reverse();
  const [open, setOpen] = useState<number | null>(edits[0]?.index ?? null);
  const [view, setView] = useState<View>("changes");
  const shown = edits.find((edit) => edit.index === open) ?? null;

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border bg-accent/40 p-3"
      aria-label="History"
      data-page-history
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <HistoryIcon className="h-4 w-4 text-primary" aria-hidden /> History
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-muted hover:bg-white hover:text-foreground"
          aria-label="Close history"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto text-sm">
        {edits.map((edit, position) => (
          <li key={edit.index}>
            <button
              type="button"
              onClick={() => setOpen(open === edit.index ? null : edit.index)}
              className={cn(
                "flex w-full flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 text-left hover:bg-white",
                open === edit.index && "bg-white shadow-soft"
              )}
              aria-expanded={open === edit.index}
              data-edit={edit.index}
            >
              <span className="font-medium text-foreground">{edit.by}</span>
              <span className="text-xs text-muted">{timeAgo(edit.at)}</span>
              {position === 0 ? <span className="text-xs text-muted">· the page now</span> : null}
              {edit.before.title !== edit.after.title ? (
                <span className="text-xs text-muted">· renamed from “{edit.before.title}”</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {shown ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              label="Show"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "changes", label: "What changed" },
                { value: "before", label: "Before" },
                { value: "now", label: "Compared with now" },
              ]}
            />
            {canRestore ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-secondary-foreground hover:underline disabled:opacity-50"
                disabled={restoring}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Restore the page as it was before this change?",
                      body: "The current text stays in the history, so this can be undone too.",
                      confirmLabel: "Restore",
                    })
                  )
                    onRestore(shown.index);
                }}
              >
                <RotateCcw className="h-3 w-3" /> Restore as it was before
              </button>
            ) : null}
          </div>
          {view === "changes" ? (
            <Changes
              before={shown.before.body}
              after={shown.after.body}
              removedLabel={`Taken out by ${shown.by}`}
              addedLabel="Put in"
              circleId={circleId}
              pages={pages}
            />
          ) : view === "before" ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted">
                As {shown.before.editedBy.name} left it, {timeAgo(shown.before.editedAt)}
              </p>
              <WikiMarkdown source={shown.before.body} circleId={circleId} pages={pages} />
            </div>
          ) : (
            <SideBySide
              before={shown.before.body}
              after={page.body}
              beforeLabel={`Before ${shown.by}'s change`}
              afterLabel="The page now"
              circleId={circleId}
              pages={pages}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
