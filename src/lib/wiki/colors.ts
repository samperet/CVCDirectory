/**
 * Highlight colours for runs of text in wiki pages, written as
 * `:mark[the text]{color="yellow"}` and drawn with a `.hl-<colour>` class
 * (see `globals.css`). A small palette, shared by the server and the browser.
 */
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** Each colour's name and its ink, as RGB channels (the same values as the CSS classes). */
export const HIGHLIGHT_STYLES: Record<HighlightColor, { label: string; ink: string }> = {
  yellow: { label: "Yellow", ink: "255 245 140" },
  green: { label: "Green", ink: "176 245 160" },
  blue: { label: "Blue", ink: "166 210 255" },
  pink: { label: "Pink", ink: "255 170 208" },
  orange: { label: "Orange", ink: "255 200 150" },
};

export const DEFAULT_HIGHLIGHT: HighlightColor = "yellow";

/** A stored colour name as one of the palette (anything else is yellow). */
export const highlightColor = (name: string | null | undefined): HighlightColor =>
  (HIGHLIGHT_COLORS as readonly string[]).includes(name ?? "")
    ? (name as HighlightColor)
    : DEFAULT_HIGHLIGHT;
