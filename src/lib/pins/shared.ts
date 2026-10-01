/** Pins and sticky notes: the shapes shared by the server and the browser. */

/** Where pages can be pinned. (Pins once made on people, tasks, and forum discussions are no longer shown.) */
export const PIN_KINDS = ["community", "circle", "document"] as const;
export type PinKind = (typeof PIN_KINDS)[number];

/** Where a note is pinned. The community dashboard's id is "community". */
export interface PinTarget {
  kind: PinKind;
  id: string;
}

/** A wiki page, by its circle and its id (which stays put when it's renamed). */
export interface PinNoteRef {
  circleId: string;
  pageId: string;
}

export interface Pin {
  id: string;
  note: PinNoteRef;
  target: PinTarget;
  /** `personId` is null for pins carried over from before pins had owners. */
  pinnedBy: { personId: string | null; name: string };
  pinnedAt: string;
  /** The last day it shows (YYYY-MM-DD), or null to stay. */
  until: string | null;
  reason: string | null;
}

/** A page's colours (it shows as a card — a sticky note — and the page itself is drawn in it). */
export const NOTE_COLORS = ["white", "yellow", "orange", "red", "pink", "lavender", "blue", "teal", "green", "grey"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** Soft paper, a darker edge, and the swatch shown when choosing. Text stays the usual dark ink. */
export const NOTE_STYLES: Record<NoteColor, { label: string; paper: string; edge: string; swatch: string }> = {
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
export const noteStyle = (color: string | null | undefined) => NOTE_STYLES[(NOTE_COLORS as readonly string[]).includes(color ?? "") ? (color as NoteColor) : "yellow"];

/** A pin, ready to show: its note, where it is, and whether you can take it down. */
export interface PinView {
  id: string;
  note: {
    circleId: string;
    circleName: string;
    pageId: string;
    slug: string;
    title: string;
    excerpt: string;
    color: NoteColor;
    href: string;
    /** The whole page (Markdown), when asked for (`full`). */
    body?: string;
  };
  target: PinTarget & { label: string; href: string; external?: boolean };
  pinnedBy: { name: string };
  pinnedAt: string;
  until: string | null;
  reason: string | null;
  canUnpin: boolean;
}

/** Something a note can be pinned to, for choosing. */
export interface PinTargetOption extends PinTarget {
  label: string;
  meta: string | null;
}

export const KIND_LABELS: Record<PinKind, string> = {
  community: "Community",
  circle: "Circle",
  document: "Document",
};

export const targetKey = (target: PinTarget) => `${target.kind}:${target.id}`;
export function parseTargetKey(value: string | null): PinTarget | null {
  if (!value) return null;
  const colon = value.indexOf(":");
  const kind = value.slice(0, colon) as PinKind;
  const id = value.slice(colon + 1);
  return colon > 0 && (PIN_KINDS as readonly string[]).includes(kind) && id ? { kind, id } : null;
}
