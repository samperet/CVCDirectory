/**
 * How a circle's page is laid out: its sections in order, each with a size
 * (on wider screens; phones stack them all full width). Set by the circle's
 * members (and the Board) for everyone; whether a section is folded away is
 * up to each reader, on their own device.
 */

export const SECTION_IDS = ["information", "members", "schedule", "tasks", "documents"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_SIZES = ["small", "medium", "large", "full"] as const;
export type SectionSize = (typeof SECTION_SIZES)[number];

export interface SectionLayout {
  id: SectionId;
  size: SectionSize;
}

export const SIZE_LABELS: Record<SectionSize, string> = { small: "⅓", medium: "½", large: "⅔", full: "Full" };
export const SIZE_NAMES: Record<SectionSize, string> = { small: "A third", medium: "Half", large: "Two thirds", full: "Full width" };

export const DEFAULT_LAYOUT: SectionLayout[] = [
  { id: "information", size: "large" },
  { id: "members", size: "small" },
  { id: "schedule", size: "full" },
  { id: "tasks", size: "full" },
  { id: "documents", size: "full" },
];

/**
 * The page's sections, in the circle's order: the ones it has (turned on,
 * or that exist for it) — and any it has but never placed, after, as they
 * come by default.
 */
export function layoutFor(stored: SectionLayout[] | undefined, available: SectionId[]): SectionLayout[] {
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
