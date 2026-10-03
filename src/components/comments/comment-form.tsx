"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Writing a comment, a reply, or an edit: a text area with Save and Cancel.
 * ⌘/Ctrl+Enter sends, Escape cancels. What was typed is kept if sending
 * fails (the caller has shown the error) and cleared once it's sent.
 * `children` go between the text and the buttons: anything else the feature
 * asks for (the people a log update involved), kept and cleared by the caller.
 */
export function CommentForm({
  placeholder,
  initial = "",
  submitLabel,
  autoFocus,
  busy,
  minLength = 1,
  maxLength = 4000,
  rows,
  onSubmit,
  onCancel,
  children,
}: {
  placeholder: string;
  initial?: string;
  submitLabel: string;
  autoFocus?: boolean;
  busy: boolean;
  /** Shortest text accepted (an objection needs a reason, say). */
  minLength?: number;
  maxLength?: number;
  rows?: number;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
  children?: ReactNode;
}) {
  const [body, setBody] = useState(initial);
  const ready = body.trim().length >= minLength;
  const submit = async () => {
    if (!ready || busy) return;
    try {
      await onSubmit(body.trim());
      setBody("");
    } catch {
      // Kept, so it can be sent again; the error has been shown.
    }
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Textarea
        autoFocus={autoFocus}
        rows={rows ?? (initial || autoFocus ? 3 : 2)}
        value={body}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
          if (event.key === "Escape") onCancel?.();
        }}
        className="bg-white"
        aria-label={placeholder}
      />
      {children}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!ready || busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
