import type { Circle } from "@/lib/directory/types";

/**
 * What a circle has turned on for itself: tasks and documents, each on
 * unless turned off. Since circle pages became modules these follow from the
 * page (saving modules sets them), and gate the task and document APIs.
 * `features.wiki`, from before, is read only by `modulesFor`.
 */
export type CircleFeature = "documents" | "tasks";

export const featureEnabled = (
  circle: Pick<Circle, "id" | "features"> | undefined,
  feature: CircleFeature
) => circle?.features?.[feature] ?? true;

/** Whether the circle lets any resident add tasks (its Tasks module's setting), rather than just its members. */
export const anyoneAddsTasks = (circle: Pick<Circle, "modules"> | undefined) =>
  !!circle?.modules?.some((module) => module.type === "tasks" && module.tasks?.add === "anyone");
