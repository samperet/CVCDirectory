"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, CornerDownLeft, Mic, MicOff, Trash2, X } from "lucide-react";
import { appendPhrase, useTranscriber } from "@/components/wiki/transcribe";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

const storageKey = (pageId: string) => `wiki-transcript:${pageId}`;
const readSaved = (pageId: string) => {
  try {
    return window.localStorage.getItem(storageKey(pageId)) ?? "";
  } catch {
    return "";
  }
};

/**
 * The transcript beside a page being written — say, meeting notes taken by
 * hand while **Transcribe** writes down what's said (the browser's own speech
 * recognition: Chrome, Edge, Safari). It fills this panel, not the page, so
 * the notes stay the notes; **Add to page** puts the transcript where the
 * cursor is. It's kept in this browser (per page) until cleared, so closing
 * the editor or reloading loses nothing.
 */
export function TranscriptPanel({
  pageId,
  onInsert,
  onClose,
}: {
  pageId: string;
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState(() => readSaved(pageId));
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
  useEffect(() => {
    try {
      if (text) window.localStorage.setItem(storageKey(pageId), text);
      else window.localStorage.removeItem(storageKey(pageId));
    } catch {
      // Private browsing, say: the transcript just isn't kept.
    }
  }, [pageId, text]);
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
            onClose();
          }}
          className="rounded-full p-1 text-muted hover:bg-accent hover:text-foreground"
          aria-label="Close the transcript"
          title="Close (the transcript is kept)"
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
                title: "Clear the transcript?",
                confirmLabel: "Clear",
                body: "This can't be undone.",
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
