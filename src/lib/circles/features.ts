import type { Circle } from "@/lib/directory/types";

/**
 * Sections a circle can turn on or off for itself: its information (the
 * wiki, polls included), tasks, and documents. Each is on unless the circle
 * turns it off.
 */
export type CircleFeature = "documents" | "wiki" | "tasks";

export const featureEnabled = (circle: Pick<Circle, "id" | "features"> | undefined, feature: CircleFeature) => circle?.features?.[feature] ?? true;
