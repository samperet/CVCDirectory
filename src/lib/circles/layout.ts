import { isCommunity } from "./ids";

/**
 * How a circle's page is laid out: its modules in order, each with a size
 * (on wider screens; phones stack them all full width). Set by the circle's
 * members (and the Board) for everyone; whether a module is folded away is
 * up to each reader, on their own device.
 */

export const MODULE_TYPES = [
  "information",
  "members",
  "schedule",
  "tasks",
  "forum",
  "log",
  "finances",
  "documents",
  "text",
] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export const MODULE_SIZES = ["small", "medium", "large", "full"] as const;
export type ModuleSize = (typeof MODULE_SIZES)[number];

const COLUMNS: Record<ModuleSize, number> = { small: 2, medium: 3, large: 4, full: 6 };

/**
 * How many of the page's six columns each module takes: its size, laid in
 * rows in order — and the last module of a row widened to fill it, so the
 * page never has holes (pure, for tests).
 */
export function rowSpans(sizes: ModuleSize[]): number[] {
  const spans = sizes.map((size) => COLUMNS[size]);
  let used = 0;
  spans.forEach((span, index) => {
    used += span;
    const next = spans[index + 1];
    if (next === undefined || used + next > 6) {
      spans[index] += 6 - used;
      used = 0;
    }
  });
  return spans;
}

/** From before modules: one entry per section of the page, in order. Read for circles that haven't saved modules. */
export interface SectionLayout {
  id: ModuleType;
  size: ModuleSize;
}

export const SIZE_LABELS: Record<ModuleSize, string> = {
  small: "⅓",
  medium: "½",
  large: "⅔",
  full: "Full",
};
export const SIZE_NAMES: Record<ModuleSize, string> = {
  small: "A third",
  medium: "Half",
  large: "Two thirds",
  full: "Full width",
};

/** How the Information section shows its pages: in full, as cards with their opening lines, or as a list of titles. */
export const INFO_VIEWS = ["full", "summary", "titles"] as const;
export type InfoView = (typeof INFO_VIEWS)[number];
export const INFO_VIEW_LABELS: Record<InfoView, string> = {
  full: "Full",
  summary: "Summary",
  titles: "Titles only",
};
export const DEFAULT_INFO_VIEW: InfoView = "summary";

const DEFAULT_LAYOUT: SectionLayout[] = [
  { id: "information", size: "large" },
  { id: "members", size: "small" },
  { id: "schedule", size: "full" },
  { id: "tasks", size: "full" },
  { id: "documents", size: "full" },
];

/**
 * An older layout's sections, in the circle's order: the ones it has (turned
 * on, or that exist for it) — and any it has but never placed, after, as
 * they come by default.
 */
function layoutFor(stored: SectionLayout[] | undefined, available: ModuleType[]): SectionLayout[] {
  const has = new Set(available);
  const placed: SectionLayout[] = [];
  for (const entry of stored ?? []) {
    if (has.has(entry.id) && !placed.some((other) => other.id === entry.id)) placed.push(entry);
  }
  for (const entry of DEFAULT_LAYOUT) {
    if (has.has(entry.id) && !placed.some((other) => other.id === entry.id)) placed.push(entry);
  }
  return placed;
}

/**
 * A circle's page is built from modules, each a size wide. Information
 * modules show a chosen set of wiki pages, and Custom Text modules the
 * circle's own formatted words (there can be several of each); the others
 * (members, the duty schedule, tasks, the log, finances, documents) appear
 * once each.
 */
export const MODULE_NAMES: Record<ModuleType, string> = {
  information: "Information",
  members: "Members",
  schedule: "Duty schedule",
  tasks: "Tasks",
  forum: "Forum",
  log: "Log",
  finances: "Finances",
  documents: "Documents",
  text: "Custom Text",
};

/** Which pages an Information module shows: chosen ones (in order), all of a circle's, a circle's proposals waiting for consent, or the most recently edited (of a circle, or the whole wiki). */
export type InfoFilter =
  | { kind: "pages"; pageIds: string[] }
  | { kind: "circle"; circleId: string }
  | { kind: "proposed"; circleId: string }
  | { kind: "recent"; limit: number; circleId?: string };
export const MAX_CHOSEN_PAGES = 12;
export const RECENT_LIMITS = { min: 3, max: 12, default: 6 } as const;

/** Who can add tasks to a circle: its members (and the Board and admins), or any resident. */
export const TASK_ADDERS = ["members", "anyone"] as const;
export type TaskAdders = (typeof TASK_ADDERS)[number];
export const TASK_ADDER_LABELS: Record<TaskAdders, string> = {
  members: "The circle's members (and the Board)",
  anyone: "Any resident",
};

/** Who can post updates to a circle's Log: its members (and the Board and admins), or any resident. */
export const LOG_POSTERS = ["members", "anyone"] as const;
export type LogPosters = (typeof LOG_POSTERS)[number];
export const LOG_POSTER_LABELS: Record<LogPosters, string> = {
  members: "The circle's members (and the Board)",
  anyone: "Any resident",
};

/**
 * Who can see a circle's Finances: everyone at CVC, or only its members and
 * the Board (admins always can). Only those — never everyone — change them.
 */
export const FINANCE_VIEWERS = ["everyone", "members"] as const;
export type FinanceViewers = (typeof FINANCE_VIEWERS)[number];
export const FINANCE_VIEWER_LABELS: Record<FinanceViewers, string> = {
  everyone: "Everyone at CVC",
  members: "The circle's members and the Board",
};

export interface CircleModule {
  id: string;
  type: ModuleType;
  size: ModuleSize;
  /** A heading of its own (Information modules); unset is the type's name. */
  title?: string;
  /** Which pages an Information module shows, and how. */
  info?: { filter: InfoFilter; view: InfoView };
  /** A Tasks module's setting: who can add tasks (unset: the circle's members). */
  tasks?: { add: TaskAdders };
  /** A Log module's setting: who can post updates (unset: the circle's members). */
  log?: { post: LogPosters };
  /** A Finances module's setting: who can see it (unset: everyone at CVC). */
  finances?: { view: FinanceViewers };
  /** A Custom Text module's words, as Markdown (the wiki's formatting), and its background (unset: white). */
  text?: { body: string; background?: TextBackground };
}

/** The background colours a Custom Text module can have: soft tints, so its words stay easy to read. */
export const TEXT_BACKGROUNDS = [
  "white",
  "mint",
  "yellow",
  "peach",
  "pink",
  "lavender",
  "blue",
] as const;
export type TextBackground = (typeof TEXT_BACKGROUNDS)[number];
export const TEXT_BACKGROUND_STYLES: Record<TextBackground, { label: string; color: string }> = {
  white: { label: "White", color: "#ffffff" },
  mint: { label: "Mint", color: "#e9f7ec" },
  yellow: { label: "Yellow", color: "#fff7d1" },
  peach: { label: "Peach", color: "#fdecdc" },
  pink: { label: "Pink", color: "#fce8f0" },
  lavender: { label: "Lavender", color: "#efe9fa" },
  blue: { label: "Blue", color: "#e5f0fc" },
};

/** Custom Text modules (and Information ones) can appear any number of times; the others once. */
export const REPEATABLE_MODULES: ModuleType[] = ["information", "text"];
export const MAX_TEXT_MODULE = 20_000;

export const MAX_MODULES = 20;

/** A module's heading. */
export const moduleTitle = (module: Pick<CircleModule, "type" | "title">, scheduleTitle?: string) =>
  module.title?.trim() ||
  (module.type === "schedule" && scheduleTitle ? scheduleTitle : MODULE_NAMES[module.type]);

/**
 * The page's modules: those the circle saved — or, until it saves any, its
 * sections as they were (in their order and sizes): Information as all of
 * the circle's own pages, shown as it chose; Members (but not on
 * Community, which is everyone); the duty schedule if it has one; Tasks
 * and Documents unless it turned them off.
 */
export function modulesFor(
  circle: {
    id: string;
    modules?: CircleModule[];
    layout?: SectionLayout[];
    features?: { documents?: boolean; wiki?: boolean; tasks?: boolean };
    infoView?: InfoView;
  },
  { hasSchedule }: { hasSchedule: boolean }
): CircleModule[] {
  // A module of a kind that's gone (Meetings, now meeting notes are pages) is left out.
  if (circle.modules)
    return circle.modules.filter((module) =>
      (MODULE_TYPES as readonly string[]).includes(module.type)
    );
  const on = (feature: "documents" | "wiki" | "tasks") => circle.features?.[feature] ?? true;
  const available: ModuleType[] = [
    ...(on("wiki") ? (["information"] as const) : []),
    ...(!isCommunity(circle.id) ? (["members"] as const) : []),
    ...(hasSchedule ? (["schedule"] as const) : []),
    ...(on("tasks") ? (["tasks"] as const) : []),
    ...(on("documents") ? (["documents"] as const) : []),
  ];
  return layoutFor(circle.layout, available).map(({ id, size }) =>
    id === "information"
      ? {
          id,
          type: id,
          size,
          info: {
            filter: { kind: "circle", circleId: circle.id },
            view: circle.infoView ?? DEFAULT_INFO_VIEW,
          },
        }
      : { id, type: id, size }
  );
}
