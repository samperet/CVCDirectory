"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  findState,
  findStep,
  replaceAll,
  replaceCurrent,
  revealCurrent,
  selectCurrent,
  setFind,
} from "@/components/wiki/editor-find";

/**
 * The find bar, under the editor's toolbar (and sticking with it): **Find**
 * marks every match as you type, with "2 of 5", ↑ ↓ (or Enter, Shift+Enter)
 * to move between them, and **Match case**; **Replace with** then
 * **Replace** (the current one, then on to the next) or **Replace all**.
 * Esc or × closes it, leaving the cursor on the match you were at. Opened
 * from the toolbar, with Ctrl/⌘+F, or Ctrl+H (⌘⇧H) for replacing; opened
 * again, it takes the words selected in the text.
 */
export function FindBar({
  editor,
  replacing: startReplacing,
  opened,
  onClose,
}: {
  editor: Editor;
  /** Show Replace too. */
  replacing: boolean;
  /** Changes each time it's asked for again (focus the box, and take the selected words). */
  opened: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const findInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replacing, setReplacing] = useState(startReplacing);
  const { count, current } = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = current ? findState(current) : null;
      return { count: state?.matches.length ?? 0, current: state?.current ?? -1 };
    },
  });

  // Asked for (again): take the words selected in the text, if they're short, and focus the box.
  useEffect(() => {
    // The browser's selection, if it's in the text (the editor may not have caught up with a quick Ctrl+F).
    const dom = window.getSelection();
    const { from, to, empty } = editor.state.selection;
    const selected =
      dom && dom.rangeCount && editor.view.dom.contains(dom.anchorNode)
        ? dom.toString()
        : empty
          ? ""
          : editor.state.doc.textBetween(from, to, "\n", "");
    if (selected && selected.length <= 100 && !selected.includes("\n")) setQuery(selected);
    if (startReplacing) setReplacing(true);
    const box = startReplacing && !selected ? replaceInput.current : findInput.current;
    (box ?? findInput.current)?.focus();
    findInput.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  useEffect(() => setFind(editor, query, caseSensitive), [editor, query, caseSensitive]);
  // Gone: the marks go too.
  useEffect(() => () => setFind(editor, "", false), [editor]);
  useEffect(() => revealCurrent(editor), [editor, current, query]);

  const close = () => {
    selectCurrent(editor);
    onClose();
    editor.commands.focus();
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>, onEnter: () => void) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey && event.currentTarget === findInput.current) findStep(editor, -1);
      else onEnter();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      findInput.current?.select();
    }
  };
  const replaceOne = () => {
    if (!replaceCurrent(editor, replacement)) findStep(editor, 1);
  };
  const replaceEvery = () => {
    const replaced = replaceAll(editor, replacement);
    toast({
      title: replaced
        ? `Replaced ${replaced} ${replaced === 1 ? "match" : "matches"}`
        : "Nothing to replace",
    });
  };
  const tool =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-light transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
  return (
    <div
      className="flex w-full basis-full flex-col gap-1.5 border-t border-border px-1 pb-1 pt-2"
      role="search"
      aria-label="Find and replace"
      data-find-bar
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          ref={findInput}
          value={query}
          onChange={(event) => setQuery(event.target.value.replace(/\n/g, " "))}
          onKeyDown={(event) => keys(event, () => findStep(editor, 1))}
          placeholder="Find"
          aria-label="Find"
          className="h-8 min-w-0 flex-1 basis-40 bg-white"
          data-find-input
        />
        <span className="min-w-[4.5rem] text-xs tabular-nums text-muted" data-find-count>
          {query ? (count ? `${current + 1} of ${count}` : "No matches") : ""}
        </span>
        <button
          type="button"
          className={tool}
          onClick={() => findStep(editor, -1)}
          disabled={!count}
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          onClick={() => findStep(editor, 1)}
          disabled={!count}
          aria-label="Next match"
          title="Next match (Enter)"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(tool, caseSensitive && "bg-accent text-foreground")}
          onClick={() => setCaseSensitive((on) => !on)}
          aria-pressed={caseSensitive}
          aria-label="Match case"
          title="Match case"
        >
          <CaseSensitive className="h-4 w-4" />
        </button>
        {replacing ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              setReplacing(true);
              setTimeout(() => replaceInput.current?.focus(), 0);
            }}
          >
            Replace…
          </Button>
        )}
        <button
          type="button"
          className={tool}
          onClick={close}
          aria-label="Close find"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {replacing ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            ref={replaceInput}
            value={replacement}
            onChange={(event) => setReplacement(event.target.value.replace(/\n/g, " "))}
            onKeyDown={(event) => keys(event, replaceOne)}
            placeholder="Replace with"
            aria-label="Replace with"
            className="h-8 min-w-0 flex-1 basis-40 bg-white"
            data-replace-input
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={replaceOne}
            disabled={!count}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={replaceEvery}
            disabled={!count}
          >
            Replace all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
