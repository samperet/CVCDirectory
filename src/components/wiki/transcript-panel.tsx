"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, CornerDownLeft, Mic, MicOff, Trash2, X } from "lucide-react";
import { appendPhrase, useTranscriber } from "@/components/wiki/transcribe";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

const SAVE_AFTER_MS = 1500;

/**
 * The transcript beside a page being written — say, meeting notes taken by
 * hand while **Transcribe** writes down what's said (the browser's own speech
 * recognition: Chrome, Edge, Safari). It fills this panel, not the page, so
 * the notes stay the notes; **Add to page** puts the transcript where the
 * cursor is. It's saved with the page as it fills (`onSave`, a moment after
 * each phrase), where anyone reading the page can unfold it later.
 */
export function TranscriptPanel({
  initial,
  onSave,
  onInsert,
  onClose,
}: {
  /** The page's transcript so far (new words are added to it). */
  initial: string;
  onSave: (text: string) => Promise<unknown>;
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const savedText = useRef(initial);
  const latest = useRef(initial);
  latest.current = text;
  const save = useRef(onSave);
  save.current = onSave;
  const box = useRef<HTMLDivElement>(null);
  const pause = useRef(false);
  const transcriber = useTranscriber((phrase) => {
    const fresh = pause.current;
    pause.current = false;
    setText((current) => appendPhrase(current, phrase, fresh));
  });
  const { start, stop, listening, interim, error, supported } = transcriber;

  // Start listening as it opens (stopped again when it closes).
  useEffect(() => {
    if (supported) start();
  }, [supported, start]);
  // Saved with the page a moment after it changes (and on closing).
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
  // Follow the newest words.
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [text, interim]);

  return (
    <section
      aria-label="Transcript"
      data-transcript-panel
      className="fixed inset-x-2 bottom-2 z-40 flex max-h-[45vh] flex-col rounded-2xl border border-border bg-white shadow-elev sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:max-h-[60vh]"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            listening ? "animate-pulse bg-red-500" : "bg-border"
          )}
          aria-hidden
        />
        <h2 className="flex-1 text-sm font-semibold text-foreground">
          Transcript{" "}
          <span className="font-normal text-muted">
            {listening ? "· listening" : supported === false ? "· not available" : "· paused"}
          </span>
          <span className="block text-[11px] font-normal text-muted" data-transcript-status>
            {status === "saving"
              ? "Saving with the page…"
              : status === "unsaved"
                ? "Not saved yet"
                : status === "error"
                  ? "Couldn't save — it'll try again"
                  : "Saved with the page"}
          </span>
        </h2>
        {supported ? (
          listening ? (
            <Button size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={stop}>
              <MicOff className="h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2"
              onClick={() => {
                pause.current = true;
                start();
              }}
            >
              <Mic className="h-4 w-4" /> Listen
            </Button>
          )
        ) : null}
        <button
          type="button"
          onClick={() => {
            stop();
            void flush(text);
            onClose();
          }}
          className="rounded-full p-1 text-muted hover:bg-accent hover:text-foreground"
          aria-label="Close the transcript"
          title="Close (the transcript stays with the page)"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div
        ref={box}
        className="min-h-[6rem] flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed"
      >
        {supported === false ? (
          <p className="text-muted">
            This browser can&apos;t transcribe — try Chrome, Edge, or Safari.
          </p>
        ) : !text && !interim ? (
          <p className="text-muted">
            {listening
              ? "Listening… what's said appears here while you take notes in the page."
              : "Press Listen to transcribe what's said."}
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-foreground" data-transcript-text>
            {text}
            {interim ? <span className="text-muted"> {interim}</span> : null}
          </p>
        )}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
      <footer className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
        <Button
          size="sm"
          className="h-8 gap-1"
          disabled={!text.trim()}
          onClick={() => onInsert(text)}
          title="Put the transcript where the cursor is in the page"
        >
          <CornerDownLeft className="h-4 w-4" /> Add to page
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2"
          disabled={!text.trim()}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast({ title: "Transcript copied" });
            } catch {
              toast({ title: "Couldn't copy — select the text instead" });
            }
          }}
        >
          <Copy className="h-4 w-4" /> Copy
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-8 gap-1 px-2 hover:text-destructive"
          disabled={!text.trim()}
          onClick={async () => {
            if (
              await confirm({
                title: "Clear the page's transcript?",
                confirmLabel: "Clear",
                body: "It's gone for everyone. This can't be undone.",
                destructive: true,
              })
            )
              setText("");
          }}
        >
          <Trash2 className="h-4 w-4" /> Clear
        </Button>
      </footer>
    </section>
  );
}
