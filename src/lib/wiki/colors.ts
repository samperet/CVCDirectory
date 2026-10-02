/** Wiki pages' colours: a page is drawn in its colour, and shows as a card of it. Shared by the server and the browser. */

/** A page's colours: the page is drawn in it, and so is its card in a circle's Information. */
export const PAGE_COLORS = [
  "white",
  "yellow",
  "orange",
  "red",
  "pink",
  "lavender",
  "blue",
  "teal",
  "green",
  "grey",
] as const;
export type PageColor = (typeof PAGE_COLORS)[number];

/** Soft paper, a darker edge, and the swatch shown when choosing. Text stays the usual dark ink. */
export const PAGE_STYLES: Record<
  PageColor,
  { label: string; paper: string; edge: string; swatch: string }
> = {
  white: { label: "White", paper: "#ffffff", edge: "#dfe5df", swatch: "#ffffff" },
  yellow: { label: "Yellow", paper: "#fff7d1", edge: "#ecd77a", swatch: "#f6dc6b" },
  orange: { label: "Orange", paper: "#ffead6", edge: "#f0c196", swatch: "#f4ad6c" },
  red: { label: "Red", paper: "#fde3e0", edge: "#eeb1aa", swatch: "#ea8c83" },
  pink: { label: "Pink", paper: "#fbe4ea", edge: "#eab0c0", swatch: "#e99ab0" },
  lavender: { label: "Lavender", paper: "#ece6f8", edge: "#c6b8e6", swatch: "#b3a1df" },
  blue: { label: "Blue", paper: "#e0eefa", edge: "#a9c9e8", swatch: "#8bb8e3" },
  teal: { label: "Teal", paper: "#dcf2ee", edge: "#9fd3c9", swatch: "#73c2b3" },
  green: { label: "Green", paper: "#e5f4dc", edge: "#b5d6a0", swatch: "#9fcf86" },
  grey: { label: "Grey", paper: "#eef0ee", edge: "#c8cfc8", swatch: "#aeb7ae" },
};
/** A page with no colour of its own is white. */
export const DEFAULT_PAGE_COLOR: PageColor = "white";
export const pageStyle = (color: string | null | undefined) =>
  PAGE_STYLES[
    (PAGE_COLORS as readonly string[]).includes(color ?? "")
      ? (color as PageColor)
      : DEFAULT_PAGE_COLOR
  ];
