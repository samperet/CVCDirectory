"use client";

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { ChevronRight, Copy, Mic, Pause, Trash2 } from "lucide-react";
import { appendPhrase, useTranscriber } from "@/components/wiki/transcribe";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

/**
 * A page's transcript — what was said while its notes were taken — at the
 * end of the page, folded away: one line saying it's there (and how long it
 * is) until someone opens it. It's there only once someone adds it, with the
 * editor toolbar's transcript toggle, which starts recording; toggled off
 * (or **Remove**), it's taken off the page again. While editing, the line has
 * **Record** and **Pause** (the browser's own speech recognition: Chrome,
 * Edge, Safari), and what's heard is saved with the page as it comes
 * (`onSave`, a moment after each phrase); opened, it also offers Copy.
 */

const words = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
const SAVE_AFTER_MS = 1500;

function Shell({
  summary,
  actions,
  open,
  onToggle,
  children,
}: {
  summary: ReactNode;
  actions?: ReactNode;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="group mx-6 mb-6 rounded-xl border border-border bg-surface/60 sm:mx-14"
      data-page-transcript
      open={open}
      onToggle={(event) => onToggle?.((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground-light hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 transition group-open:rotate-90" aria-hidden />
        <Mic className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">{summary}</span>
        {actions}
      </summary>
      {children}
    </details>
  );
}

/** Reading a page: its transcript, folded away (nothing if it has none). */
export function PageTranscript({ transcript }: { transcript?: string }) {
  const text = transcript?.trim();
  if (!text) return null;
  const count = words(text);
  return (
    <Shell
      summary={
        <>
          Transcript{" "}
          <span className="font-normal text-muted">
            · {count.toLocaleString()} {count === 1 ? "word" : "words"}
          </span>
        </>
      }
    >
      <p className="whitespace-pre-wrap border-t border-border px-4 py-3 text-sm leading-relaxed text-foreground-light">
        {text}
      </p>
    </Shell>
  );
}

/** Taking a transcript off the page (asking first, if it has words). */
export type TranscriptControl = { remove: () => Promise<void> };

/** Editing a page: its transcript, folded away, with Record and Pause; saved as it fills. */
export function TranscriptSection({
  initial,
  onSave,
  recordSignal,
  onRemoved,
  control,
}: {
  /** The page's transcript so far (new words are added to it). */
  initial: string;
  onSave: (text: string) => Promise<unknown>;
  /** Changes each time the toolbar's toggle adds the transcript (0 if it was there already): start recording. */
  recordSignal: number;
  /** It's been taken off the page (its words deleted). */
  onRemoved: () => void;
  control?: MutableRefObject<TranscriptControl | null>;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const savedText = useRef(initial);
  const latest = useRef(initial);
  latest.current = text;
  const save = useRef(onSave);
  save.current = onSave;
  const pause = useRef(false);
  const section = useRef<HTMLDivElement>(null);
  const { start, stop, listening, interim, error, supported } = useTranscriber((phrase) => {
    const fresh = pause.current;
    pause.current = false;
    setText((current) => appendPhrase(current, phrase, fresh));
  });

  const flush = async (value: string) => {
    if (value === savedText.current) return;
    setStatus("saving");
    try {
      await save.current(value);
      savedText.current = value;
      setStatus("saved");
    } catch {
      setStatus("error");
      // Try again shortly with whatever it says by then.
      setTimeout(() => void flush(latest.current), 5000);
    }
  };
  useEffect(() => {
    if (text === savedText.current) return;
    setStatus("unsaved");
    const timer = setTimeout(() => void flush(text), SAVE_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  // Leaving the editor: save what's waiting.
  useEffect(
    () => () => {
      void flush(latest.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const record = () => {
    // A new recording starts a new paragraph.
    pause.current = !!latest.current.trim();
    start();
  };
  // Just added with the toolbar's toggle: record, and bring the transcript into view.
  const handledSignal = useRef(0);
  useEffect(() => {
    if (!recordSignal || recordSignal === handledSignal.current) return;
    handledSignal.current = recordSignal;
    record();
    setOpen(true);
    section.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordSignal]);

  const remove = async () => {
    if (
      latest.current.trim() &&
      !(await confirm({
        title: "Remove the page's transcript?",
        body: "Its words are deleted for everyone. This can't be undone.",
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    stop();
    try {
      if (savedText.current) await save.current("");
    } catch {
      toast({ title: "Couldn't remove the transcript — try again", variant: "destructive" });
      return;
    }
    savedText.current = "";
    latest.current = "";
    setText("");
    onRemoved();
  };
  if (control) control.current = { remove };

  const count = words(text);
  const button =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition";
  return (
    <div ref={section}>
      <Shell
        open={open}
        onToggle={setOpen}
        summary={
          <>
            Transcript{" "}
            <span className="font-normal text-muted">
              · {count ? `${count.toLocaleString()} ${count === 1 ? "word" : "words"}` : "none yet"}
              {listening ? (
                <>
                  {" "}
                  · <span className="text-red-600">recording</span>
                </>
              ) : null}
              {status === "saving" || status === "unsaved"
                ? " · saving…"
                : status === "error"
                  ? " · couldn't save, trying again"
                  : ""}
            </span>
          </>
        }
        actions={
          supported === false ? (
            <span className="text-xs font-normal text-muted">Try Chrome, Edge, or Safari</span>
          ) : listening ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                stop();
              }}
              className={cn(button, "bg-foreground/10 text-foreground hover:bg-foreground/15")}
            >
              <Pause className="h-3.5 w-3.5" aria-hidden /> Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                record();
              }}
              disabled={supported === null}
              className={cn(button, "bg-red-600 text-white hover:bg-red-700")}
            >
              <span className="h-2 w-2 rounded-full bg-white" aria-hidden /> Record
            </button>
          )
        }
      >
        <div className="border-t border-border">
          {text || interim ? (
            <p
              className="max-h-80 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-foreground-light"
              data-transcript-text
            >
              {text}
              {interim ? <span className="text-muted"> {interim}</span> : null}
            </p>
          ) : (
            <p className="px-4 py-3 text-sm text-muted">
              {listening
                ? "Listening… what's said appears here while you take notes in the page."
                : "Press Record to transcribe what's said while you take notes."}
            </p>
          )}
          {error ? <p className="px-4 pb-2 text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-1 border-t border-border px-3 py-1.5">
            {text.trim() ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-accent hover:text-foreground"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    toast({ title: "Transcript copied" });
                  } catch {
                    toast({ title: "Couldn't copy — select the text instead" });
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
              </button>
            ) : null}
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-accent hover:text-destructive"
              onClick={() => void remove()}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
            </button>
          </div>
        </div>
      </Shell>
    </div>
  );
}
