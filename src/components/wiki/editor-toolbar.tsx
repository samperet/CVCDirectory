"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { getMarkRange, type Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Columns3,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Redo2,
  Rows3,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLES,
  highlightColor,
  type HighlightColor,
} from "@/lib/wiki/colors";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * The visual editor's toolbar parts, shared by pages and Custom Text
 * modules: buttons, the drop-down menus (Style, Highlight, Link — each a
 * combobox), lists, undo and redo, the link and photo boxes, the table's
 * own tools while the cursor is in one, and the palette that floats over a
 * highlight. Pressing any of them leaves the cursor (and selection) in the
 * text.
 */

/** Pressing a toolbar control doesn't take the cursor out of the text. */
const keep = (event: React.MouseEvent) => event.preventDefault();

export function ToolbarButton({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keep}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-1.5 text-foreground-light transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export const ToolbarSeparator = () => (
  <span className="mx-1 h-5 w-px shrink-0 bg-border" role="separator" aria-hidden />
);

export interface MenuOption<T extends string> {
  value: T;
  label: ReactNode;
  /** What the option is called (for assistive tech), when its label is more than words. */
  name?: string;
}

/**
 * A drop-down in the toolbar: a combobox button (named by `title`) opening
 * a list of options. Arrow keys, Enter and Escape work; choosing keeps the
 * cursor in the text.
 */
export function ToolbarMenu<T extends string>({
  title,
  trigger,
  options,
  value,
  onChoose,
}: {
  title: string;
  trigger: ReactNode;
  options: MenuOption<T>[];
  value?: T | null;
  onChoose: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close, true);
    return () => document.removeEventListener("mousedown", close, true);
  }, [open]);
  const choose = (option: MenuOption<T>) => {
    setOpen(false);
    onChoose(option.value);
  };
  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value)
      )
    );
    setOpen(true);
  };
  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label={title}
        title={title}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        onMouseDown={keep}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            show();
          } else if (open && event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          } else if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((current) => (current + step + options.length) % options.length);
          } else if (open && event.key === "Enter") {
            event.preventDefault();
            choose(options[active]);
          }
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-sm text-foreground-light transition hover:bg-accent hover:text-foreground",
          open && "bg-accent text-foreground"
        )}
      >
        {trigger}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </button>
      {open ? (
        <div
          id={id}
          role="listbox"
          aria-label={title}
          className="absolute left-0 top-full z-40 mt-1 flex min-w-[11rem] flex-col rounded-lg border border-border bg-white p-1 shadow-elev"
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              role="option"
              aria-label={option.name}
              aria-selected={option.value === value}
              tabIndex={-1}
              onMouseDown={keep}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
              className={cn(
                "flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-foreground",
                index === active && "bg-accent",
                option.value === value && "font-semibold"
              )}
            >
              {option.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// --- Style -----------------------------------------------------------------------------------

type Style = "paragraph" | "quote" | "callout" | "h1" | "h2" | "h3";
const STYLES: MenuOption<Style>[] = [
  { value: "paragraph", label: "Paragraph" },
  { value: "quote", label: "Quote" },
  { value: "callout", label: "Callout" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
];

/**
 * The toolbar's **Style**: Paragraph, Quote, Callout, or a heading, for the
 * block the cursor is in. A quote or callout takes in the selected blocks
 * (keeping their bold and italic); Paragraph takes them out again.
 */
export function StyleMenu({ editor }: { editor: Editor }) {
  const current = useEditorState({
    editor,
    selector: ({ editor: e }): Style => {
      for (const level of [1, 2, 3] as const)
        if (e.isActive("heading", { level })) return `h${level}`;
      if (e.isActive("callout")) return "callout";
      if (e.isActive("blockquote")) return "quote";
      return "paragraph";
    },
  });
  const label = STYLES.find((style) => style.value === current)?.label ?? "Style";
  return (
    <ToolbarMenu<Style>
      title="Style"
      trigger={<span className="w-[5.5rem] truncate text-left">{label}</span>}
      options={STYLES}
      value={current}
      onChoose={(style) => {
        const chain = editor.chain().focus();
        if (style === "paragraph") {
          if (editor.isActive("callout")) chain.lift("callout");
          if (editor.isActive("blockquote")) chain.lift("blockquote");
          chain.setParagraph().run();
        } else if (style === "quote") {
          if (!editor.isActive("blockquote")) chain.setParagraph().wrapIn("blockquote").run();
        } else if (style === "callout") {
          if (!editor.isActive("callout")) chain.wrapIn("callout").run();
        } else {
          chain.setHeading({ level: Number(style.slice(1)) as 1 | 2 | 3 }).run();
        }
      }}
    />
  );
}

// --- Bold, italic, lists, undo ---------------------------------------------------------------

export function MarkButtons({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e.isActive("bold"), italic: e.isActive("italic") }),
  });
  return (
    <>
      <ToolbarButton
        title="Bold"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
    </>
  );
}

export function ListButtons({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bullet: e.isActive("bulletList"),
      number: e.isActive("orderedList"),
      check: e.isActive("taskList"),
    }),
  });
  return (
    <>
      <ToolbarButton
        title="Bulleted list"
        active={state.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        active={state.number}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="To-do list"
        active={state.check}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>
    </>
  );
}

export function UndoRedo({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ undo: e.can().undo(), redo: e.can().redo() }),
  });
  return (
    <>
      <ToolbarButton
        title="Undo"
        disabled={!state.undo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Redo"
        disabled={!state.redo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
    </>
  );
}

export function DividerButton({ editor }: { editor: Editor }) {
  return (
    <ToolbarButton
      title="Insert divider"
      onClick={() => editor.chain().focus().setHorizontalRule().run()}
    >
      <Minus className="h-4 w-4" />
    </ToolbarButton>
  );
}

// --- Highlights ------------------------------------------------------------------------------

/**
 * Highlight the selected words in a colour — or, with the cursor in a
 * highlight and nothing selected, change that highlight's colour. False
 * (with why) when there's nothing to highlight.
 */
export function applyHighlight(editor: Editor, color: HighlightColor): string | null {
  const { empty } = editor.state.selection;
  const chain = editor.chain().focus();
  if (empty && editor.isActive("highlight")) {
    chain.extendMarkRange("highlight").setMark("highlight", { color }).run();
    return null;
  }
  if (empty) return "Select the words to highlight first";
  chain.setMark("highlight", { color }).run();
  return null;
}

/** Take the highlight off the words the cursor is in (or the selected ones). */
export function removeHighlight(editor: Editor) {
  const chain = editor.chain().focus();
  if (editor.state.selection.empty) chain.extendMarkRange("highlight");
  chain.unsetMark("highlight").run();
}

/** The toolbar's highlighter: choose a colour for the selected words. */
export function HighlightMenu({ editor }: { editor: Editor }) {
  const { toast } = useToast();
  return (
    <ToolbarMenu<HighlightColor>
      title="Highlight"
      trigger={<Highlighter className="h-4 w-4" />}
      options={HIGHLIGHT_COLORS.map((name) => ({
        value: name,
        name: HIGHLIGHT_STYLES[name].label,
        label: (
          <span className="flex items-center gap-2" data-highlight-choice={name}>
            <span className={`h-3.5 w-3.5 rounded-sm border border-black/10 hl-${name}`} />
            {HIGHLIGHT_STYLES[name].label}
          </span>
        ),
      }))}
      onChoose={(color) => {
        const problem = applyHighlight(editor, color);
        if (problem) toast({ title: problem });
      }}
    />
  );
}

/**
 * While the cursor is in a highlight, its palette floats just above it:
 * a colour changes it, the eraser takes it off. (`host` is the positioned
 * element the editor sits in.)
 */
export function HighlightTools({
  editor,
  host,
}: {
  editor: Editor;
  host: React.RefObject<HTMLElement>;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e.isFocused || !e.isActive("highlight")) return null;
      const { $from } = e.state.selection;
      const range = getMarkRange($from, e.schema.marks.highlight);
      return {
        from: range?.from ?? $from.pos,
        color: highlightColor(e.getAttributes("highlight").color),
      };
    },
  });
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!state || !host.current) return setAt(null);
    const box = host.current.getBoundingClientRect();
    const coords = editor.view.coordsAtPos(state.from);
    setAt({ left: Math.max(0, coords.left - box.left), top: coords.top - box.top - 34 });
  }, [state, editor, host]);
  if (!state || !at) return null;
  return (
    <span
      contentEditable={false}
      style={{ left: at.left, top: at.top }}
      className="absolute z-30 flex items-center gap-1 rounded-full border border-border bg-white px-1.5 py-1 shadow-elev"
      data-highlight-tools
    >
      {HIGHLIGHT_COLORS.map((name) => (
        <button
          key={name}
          type="button"
          title={HIGHLIGHT_STYLES[name].label}
          aria-label={`${HIGHLIGHT_STYLES[name].label} highlight`}
          aria-pressed={name === state.color}
          onMouseDown={keep}
          onClick={() => applyHighlight(editor, name)}
          className={cn(
            "h-5 w-5 rounded-full border border-black/10",
            `hl-${name}`,
            name === state.color && "ring-2 ring-foreground/50 ring-offset-1"
          )}
        />
      ))}
      <button
        type="button"
        title="No highlight"
        aria-label="Remove highlight"
        onMouseDown={keep}
        onClick={() => removeHighlight(editor)}
        className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-accent hover:text-foreground"
      >
        <Eraser className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

// --- Links -----------------------------------------------------------------------------------

/**
 * The link box: a web address for the selected words (or the link the
 * cursor is in) — or, with nothing selected, for words typed here.
 */
export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const inLink = editor.isActive("link");
  const selected = !editor.state.selection.empty;
  const [url, setUrl] = useState<string>(inLink ? editor.getAttributes("link").href ?? "" : "");
  const [text, setText] = useState("");
  const save = () => {
    const href = url.trim();
    if (!href) return;
    const full = /^[a-z][\w+.-]*:|^\/|^#|^mailto:/i.test(href) ? href : `https://${href}`;
    const chain = editor.chain().focus();
    if (inLink) chain.extendMarkRange("link").setLink({ href: full }).run();
    else if (selected) chain.setLink({ href: full }).run();
    else
      chain
        .insertContent({
          type: "text",
          text: text.trim() || full,
          marks: [{ type: "link", attrs: { href: full } }],
        })
        .run();
    onClose();
  };
  return (
    <Dialog title={inLink ? "Change the link" : "Add a link"} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        data-editor-dialog
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Web address
          <Input
            id="link-url"
            name="url"
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className="bg-white"
          />
        </label>
        {!inLink && !selected ? (
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Words to show <span className="sr-only">(optional)</span>
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="The address itself"
              className="bg-white"
            />
          </label>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {inLink ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                onClose();
              }}
            >
              Remove link
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!url.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// --- Photos ----------------------------------------------------------------------------------

/** Add a photo: one from this device (uploaded), or one already on the web. */
export function ImageDialog({
  editor,
  upload,
  onClose,
}: {
  editor: Editor;
  upload: (file: File) => Promise<string>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const src = file ? await upload(file) : url.trim();
      if (!src) return;
      editor
        .chain()
        .focus()
        .insertContent({ type: "image", attrs: { src, alt: alt.trim() || null } })
        .run();
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Add a photo"
      icon={<ImagePlus className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          From this device
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="text-sm"
            aria-label="Photo file"
          />
        </label>
        {file ? null : (
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Or its web address
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              className="bg-white"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          What it shows <span className="sr-only">(for those who can&apos;t see it)</span>
          <Input
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            placeholder="Optional"
            className="bg-white"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || (!file && !url.trim())}>
            {busy ? "Adding…" : "Add photo"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// --- Tables ----------------------------------------------------------------------------------

export function InsertTableButton({ editor }: { editor: Editor }) {
  return (
    <ToolbarButton
      title="Insert table"
      onClick={() =>
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      }
    >
      <Table2 className="h-4 w-4" />
    </ToolbarButton>
  );
}

/** While the cursor is in a table: add a row or column, or take one out (or the table). */
export function TableTools({ editor }: { editor: Editor }) {
  const inTable = useEditorState({ editor, selector: ({ editor: e }) => e.isActive("table") });
  if (!inTable) return null;
  return (
    <span className="flex items-center" data-table-tools>
      <ToolbarSeparator />
      <ToolbarButton title="Add a row" onClick={() => editor.chain().focus().addRowAfter().run()}>
        <Rows3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Add a column"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <Columns3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Delete the row"
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        <Rows3 className="h-4 w-4 text-destructive" />
      </ToolbarButton>
      <ToolbarButton
        title="Delete the column"
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        <Columns3 className="h-4 w-4 text-destructive" />
      </ToolbarButton>
      <ToolbarButton
        title="Delete the table"
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </ToolbarButton>
    </span>
  );
}
