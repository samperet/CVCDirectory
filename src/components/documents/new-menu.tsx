"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { NewPageForm } from "@/components/wiki/wiki-client";

/**
 * The Documents list's one "New" button: **Write a page** (a title, then the
 * editor) or **Upload a file**. Either may be missing for someone who can't
 * do it; with neither, there's no button.
 */
export function NewMenu({
  canWrite,
  canUpload,
  onUpload,
  onWrite,
}: {
  canWrite: boolean;
  canUpload: boolean;
  onUpload: () => void;
  onWrite: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !box.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!canWrite && !canUpload) return null;
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div ref={box} className="relative">
      <Button
        className="gap-1.5"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus className="h-4 w-4" /> New <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label="New"
          className="absolute right-0 z-30 mt-1.5 w-64 rounded-lg border border-border bg-white p-1 shadow-elev"
        >
          {canWrite ? (
            <button
              type="button"
              role="menuitem"
              onClick={choose(onWrite)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">Write a page</span>
                <span className="block text-xs text-muted">
                  Written here, kept up to date together
                </span>
              </span>
            </button>
          ) : null}
          {canUpload ? (
            <button
              type="button"
              role="menuitem"
              onClick={choose(onUpload)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <Upload className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">Upload a file</span>
                <span className="block text-xs text-muted">
                  A PDF, Word file, spreadsheet, scan, or photo
                </span>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "Write a page": its title and (unless a circle's page decides) the circle that keeps it, then the editor. */
export function WritePageDialog({
  initialTitle,
  from,
  circleId,
  preferredCircle,
  onClose,
}: {
  initialTitle?: string;
  from?: string;
  /** From a circle's page: that circle keeps it. */
  circleId?: string;
  /** The circle chosen at first (the list's circle filter), which can be changed. */
  preferredCircle?: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="Write a page"
      icon={<BookOpen className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <p className="text-sm text-muted">
        Give it a title; you&apos;ll write it next. Everyone it&apos;s open to can improve it, and
        its circle can record when it consented to it.
      </p>
      <NewPageForm
        initialTitle={initialTitle}
        from={from}
        keeper={circleId ?? (preferredCircle || undefined)}
        lockKeeper={!!circleId}
        onCancel={onClose}
      />
    </Dialog>
  );
}
