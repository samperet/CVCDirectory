import type { Circle } from "@/lib/directory/types";

/**
 * Sections a circle can turn on or off for itself: its information (the
 * wiki, polls included), tasks, and documents. Each is on unless the circle
 * turns it off.
 */
export type CircleFeature = "documents" | "wiki" | "tasks";

export const featureEnabled = (circle: Pick<Circle, "id" | "features"> | undefined, feature: CircleFeature) => circle?.features?.[feature] ?? true;

/** Whether the circle lets any resident add tasks (its Tasks module's setting), rather than just its members. */
export const anyoneAddsTasks = (circle: Pick<Circle, "modules"> | undefined) => !!circle?.modules?.some((module) => module.type === "tasks" && module.tasks?.add === "anyone");
