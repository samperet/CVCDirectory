"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Transcribing a meeting with the browser's own speech recognition (Chrome,
 * Edge, and Safari have it; Firefox doesn't): nothing to install or pay
 * for, and no speaker labels. Words come in as they're recognised; each
 * finished phrase is handed over to go into the notes. Recognition stops
 * itself after a quiet spell, so it's started again until it's stopped.
 */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "The microphone is blocked for this site — allow it in your browser's settings.",
  "service-not-allowed": "This browser won't transcribe here — try Chrome, Edge, or Safari.",
  "audio-capture": "No microphone was found.",
  network: "Transcribing needs an internet connection.",
};

export function useTranscriber(onPhrase: (text: string) => void) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const phrase = useRef(onPhrase);
  phrase.current = onPhrase;

  useEffect(() => setSupported(!!recognitionClass()), []);

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionClass();
    if (!Recognition) return;
    setError(null);
    const engine = new Recognition();
    engine.continuous = true;
    engine.interimResults = true;
    engine.lang = navigator.language || "en-US";
    engine.onresult = (event) => {
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (result.isFinal) phrase.current(text);
        else pending += `${text} `;
      }
      setInterim(pending.trim());
    };
    engine.onerror = (event) => {
      // A quiet spell or a dropped phrase isn't worth stopping for.
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(ERRORS[event.error] ?? "Transcribing stopped unexpectedly.");
      wanted.current = false;
    };
    engine.onend = () => {
      setInterim("");
      if (wanted.current) {
        try {
          engine.start();
          return;
        } catch {
          // Couldn't pick up again: fall through and stop.
        }
      }
      wanted.current = false;
      setListening(false);
    };
    recognition.current?.abort();
    recognition.current = engine;
    wanted.current = true;
    try {
      engine.start();
      setListening(true);
    } catch {
      wanted.current = false;
      setError("Transcribing couldn't start.");
    }
  }, []);

  // Leaving the page stops listening.
  useEffect(
    () => () => {
      wanted.current = false;
      recognition.current?.abort();
    },
    []
  );

  return { supported, listening, interim, error, start, stop };
}

/** Add a transcribed phrase to the end of the notes, as a sentence. */
export function appendPhrase(notes: string, text: string, startParagraph: boolean) {
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  const ended = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  if (!notes.trim()) return ended;
  if (startParagraph) return `${notes.replace(/\s+$/, "")}\n\n${ended}`;
  return `${notes.replace(/[ \t]+$/, "")}${/\n$/.test(notes) ? "" : " "}${ended}`;
}
