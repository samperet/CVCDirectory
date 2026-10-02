/**
 * Highlight colours for runs of text in wiki pages, written as
 * `:mark[the text]{color="yellow"}` and drawn with a `.hl-<colour>` class
 * (see `globals.css`). A small palette, shared by the server and the browser.
 */
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** Each colour's name and the background it paints (the same values as the CSS classes). */
export const HIGHLIGHT_STYLES: Record<HighlightColor, { label: string; background: string }> = {
  yellow: { label: "Yellow", background: "#f7e27c" },
  green: { label: "Green", background: "#bfe0a8" },
  blue: { label: "Blue", background: "#b4d4f0" },
  pink: { label: "Pink", background: "#f3bccb" },
  orange: { label: "Orange", background: "#f6c89e" },
};

export const DEFAULT_HIGHLIGHT: HighlightColor = "yellow";

/** A stored colour name as one of the palette (anything else is yellow). */
export const highlightColor = (name: string | null | undefined): HighlightColor =>
  (HIGHLIGHT_COLORS as readonly string[]).includes(name ?? "")
    ? (name as HighlightColor)
    : DEFAULT_HIGHLIGHT;
