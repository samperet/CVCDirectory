"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
  type TextFormatType,
} from "lexical";
import {
  Bold,
  ClipboardPaste,
  Code,
  Copy,
  Eraser,
  Italic,
  Link2,
  RemoveFormatting,
  Scissors,
  Strikethrough,
} from "lucide-react";
import {
  activeEditor$,
  addComposerChild$,
  applyFormat$,
  insertMarkdown$,
  openLinkEditDialog$,
  realmPlugin,
  rootEditor$,
  useCellValue,
  usePublisher,
} from "@mdxeditor/editor";
import { useToast } from "@/components/ui/use-toast";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLES,
  highlightColor,
  type HighlightColor,
} from "@/lib/wiki/colors";
import { cn } from "@/lib/utils";

/**
 * The wiki editor's right-click menu: cut, copy and paste; bold, italic,
 * strikethrough and code; highlight the selected words (or, inside a
 * highlight, change its colour or take it off); add a link; clear formatting.
 * Shift + right-click opens the browser's own menu instead (for spelling).
 * Choosing an item never moves the cursor out of the text, so the selection
 * it acts on stays put.
 */

/** The DOM event the menu sends a highlight's element: a colour, or "remove". */
export const MARK_ACTION = "wiki-mark-action";
export type MarkAction = HighlightColor | "remove";

/** The selected words as a highlight's label: Markdown's punctuation escaped, so they stay as written. */
const markLabel = (text: string) => text.replace(/[\\`*_[\]:<>~|#!]/g, "\\$&");

/**
 * The selected words (in the editor the cursor is in) as a highlight, or why
 * they can't be: nothing selected, or more than one paragraph.
 */
export function highlightMarkdown(
  active: LexicalEditor | null,
  color: HighlightColor
): { markdown: string } | { problem: string } {
  const text =
    active?.getEditorState().read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) && !selection.isCollapsed()
        ? selection.getTextContent()
        : "";
    }) ?? "";
  if (!text.trim()) return { problem: "Select the words to highlight first" };
  if (text.includes("\n")) return { problem: "Highlight within one paragraph at a time" };
  return { markdown: `:mark[${markLabel(text)}]{color="${highlightColor(color)}"}` };
}

type Open = {
  x: number;
  y: number;
  selected: boolean;
  /** The highlight right-clicked in, and its colour. */
  mark: HTMLElement | null;
  markColor: HighlightColor | null;
};

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function WikiContextMenu() {
  const root = useCellValue(rootEditor$);
  const active = useCellValue(activeEditor$);
  const applyFormat = usePublisher(applyFormat$);
  const insertMarkdown = usePublisher(insertMarkdown$);
  const openLinkDialog = usePublisher(openLinkEditDialog$);
  const { toast } = useToast();
  const [open, setOpen] = useState<Open | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Open on right-click anywhere in the text (Shift: the browser's menu).
  useEffect(() => {
    if (!root) return;
    const onContextMenu = (event: MouseEvent) => {
      if (event.shiftKey) return;
      event.preventDefault();
      const element = root.getRootElement();
      const selection = window.getSelection();
      const selected =
        !!selection &&
        !selection.isCollapsed &&
        !!element &&
        element.contains(selection.anchorNode) &&
        !!selection.toString().trim();
      const mark = (event.target as Element | null)?.closest<HTMLElement>("[data-mark-host]");
      setAt(null);
      setOpen({
        x: event.clientX,
        y: event.clientY,
        selected,
        mark: mark ?? null,
        markColor: mark ? highlightColor(mark.dataset.markHost) : null,
      });
    };
    return root.registerRootListener((element, previous) => {
      previous?.removeEventListener("contextmenu", onContextMenu);
      element?.addEventListener("contextmenu", onContextMenu);
    });
  }, [root]);

  // Keep it on screen.
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const { width, height } = menu.current.getBoundingClientRect();
    setAt({
      left: Math.max(8, Math.min(open.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(open.y, window.innerHeight - height - 8)),
    });
  }, [open]);

  // Close on Escape, a click elsewhere, scrolling, or resizing.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onDown = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const mod = isMac() ? "⌘" : "Ctrl+";
  const run = (action: () => void) => () => {
    setOpen(null);
    action();
  };
  const format = (name: TextFormatType) => run(() => applyFormat(name));
  const clipboard = (command: "cut" | "copy") =>
    run(() => {
      if (!document.execCommand(command))
        toast({ title: `Press ${mod}${command === "cut" ? "X" : "C"} to ${command}` });
    });
  const paste = run(async () => {
    const editor = active ?? root;
    try {
      const text = await navigator.clipboard.readText();
      editor?.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertRawText(text);
      });
    } catch {
      toast({ title: `Press ${mod}V to paste` });
    }
  });
  const clearFormatting = run(
    () =>
      (active ?? root)?.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        for (const node of selection.extract()) if ($isTextNode(node)) node.setFormat(0);
      })
  );
  const highlight = (color: HighlightColor) =>
    run(() => {
      if (open.mark) {
        open.mark.dispatchEvent(new CustomEvent<MarkAction>(MARK_ACTION, { detail: color }));
        return;
      }
      const result = highlightMarkdown(active, color);
      if ("problem" in result) toast({ title: result.problem });
      else insertMarkdown(result.markdown);
    });
  const removeHighlight = run(
    () => open.mark?.dispatchEvent(new CustomEvent<MarkAction>(MARK_ACTION, { detail: "remove" }))
  );
  // Keep the cursor (and selection) in the text while choosing.
  const keep = (event: React.MouseEvent) => event.preventDefault();

  const item = (
    label: string,
    Icon: typeof Bold,
    onClick: () => void,
    { shortcut, disabled = false }: { shortcut?: string; disabled?: boolean } = {}
  ) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseDown={keep}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-4 w-4 text-foreground-light" aria-hidden />
      <span className="flex-1">{label}</span>
      {shortcut ? <span className="text-xs text-muted">{shortcut}</span> : null}
    </button>
  );
  const rule = <div className="my-1 h-px bg-border" role="separator" />;
  const { selected, mark, markColor } = open;

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label="Edit text"
      data-editor-dropdown
      data-wiki-context-menu
      onContextMenu={(event) => event.preventDefault()}
      style={{
        left: at?.left ?? open.x,
        top: at?.top ?? open.y,
        visibility: at ? "visible" : "hidden",
      }}
      className="fixed z-[60] w-60 rounded-lg border border-border bg-white p-1 shadow-elev"
    >
      {item("Cut", Scissors, clipboard("cut"), { shortcut: `${mod}X`, disabled: !selected })}
      {item("Copy", Copy, clipboard("copy"), { shortcut: `${mod}C`, disabled: !selected })}
      {item("Paste", ClipboardPaste, paste, { shortcut: `${mod}V` })}
      {rule}
      {item("Bold", Bold, format("bold"), { shortcut: `${mod}B`, disabled: !selected })}
      {item("Italic", Italic, format("italic"), { shortcut: `${mod}I`, disabled: !selected })}
      {item("Strikethrough", Strikethrough, format("strikethrough"), { disabled: !selected })}
      {item("Code", Code, format("code"), { disabled: !selected })}
      {rule}
      <div className="px-2.5 py-1.5" role="group" aria-label="Highlight">
        <p className="mb-1.5 text-xs font-medium text-muted">
          {mark ? "Change highlight" : "Highlight"}
        </p>
        <div className="flex items-center gap-1.5">
          {HIGHLIGHT_COLORS.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitemradio"
              title={HIGHLIGHT_STYLES[name].label}
              aria-label={`${HIGHLIGHT_STYLES[name].label} highlight`}
              aria-checked={!!mark && name === markColor}
              disabled={!mark && !selected}
              onMouseDown={keep}
              onClick={highlight(name)}
              className={cn(
                "h-6 w-6 rounded-full border border-black/10 transition hover:scale-110 disabled:pointer-events-none disabled:opacity-40",
                `hl-${name}`,
                mark && name === markColor && "ring-2 ring-foreground/50 ring-offset-1"
              )}
            />
          ))}
          {mark ? (
            <button
              type="button"
              role="menuitem"
              title="No highlight"
              aria-label="Remove highlight"
              onMouseDown={keep}
              onClick={removeHighlight}
              className="ml-auto grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-accent hover:text-foreground"
            >
              <Eraser className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {rule}
      {item(
        "Link…",
        Link2,
        run(() => openLinkDialog()),
        { shortcut: `${mod}K` }
      )}
      {item("Clear formatting", RemoveFormatting, clearFormatting, { disabled: !selected })}
      <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-muted">
        Shift + right-click for the browser&rsquo;s menu (spelling).
      </p>
    </div>,
    document.body
  );
}

/** Adds the right-click menu to the wiki editor. */
export const contextMenuPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({ [addComposerChild$]: () => <WikiContextMenu /> });
  },
});
