/** Pins and sticky notes: the shapes shared by the server and the browser. */

export const PIN_KINDS = ["community", "circle", "person", "task", "document", "thread"] as const;
export type PinKind = (typeof PIN_KINDS)[number];

/** Where a note is pinned. A task's id is `<circleId>:<number>`; the community dashboard's is "community". */
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

/** A sticky note's colours. */
export const NOTE_COLORS = ["yellow", "green", "blue", "pink", "lavender"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** Soft paper, a darker edge, and the swatch shown when choosing. Text stays the usual dark ink. */
export const NOTE_STYLES: Record<NoteColor, { label: string; paper: string; edge: string; swatch: string }> = {
  yellow: { label: "Yellow", paper: "#fff7d1", edge: "#ecd77a", swatch: "#f6dc6b" },
  green: { label: "Green", paper: "#e5f4dc", edge: "#b5d6a0", swatch: "#9fcf86" },
  blue: { label: "Blue", paper: "#e0eefa", edge: "#a9c9e8", swatch: "#8bb8e3" },
  pink: { label: "Pink", paper: "#fbe4ea", edge: "#eab0c0", swatch: "#e99ab0" },
  lavender: { label: "Lavender", paper: "#ece6f8", edge: "#c6b8e6", swatch: "#b3a1df" },
};
export const noteStyle = (color: string | null | undefined) => NOTE_STYLES[(NOTE_COLORS as readonly string[]).includes(color ?? "") ? (color as NoteColor) : "yellow"];

/** A pin, ready to show: its note, where it is, and whether you can take it down. */
export interface PinView {
  id: string;
  note: { circleId: string; circleName: string; pageId: string; slug: string; title: string; excerpt: string; color: NoteColor; href: string };
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
  person: "Person",
  task: "Task",
  document: "Document",
  thread: "Forum",
};

export const targetKey = (target: PinTarget) => `${target.kind}:${target.id}`;
export function parseTargetKey(value: string | null): PinTarget | null {
  if (!value) return null;
  const colon = value.indexOf(":");
  const kind = value.slice(0, colon) as PinKind;
  const id = value.slice(colon + 1);
  return colon > 0 && (PIN_KINDS as readonly string[]).includes(kind) && id ? { kind, id } : null;
}
