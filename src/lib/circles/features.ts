import type { Circle } from "@/lib/directory/types";

/**
 * Features a circle can turn on or off for itself. Documents, the wiki, and
 * tasks are on unless the circle turns them off; polls are off unless it
 * turns them on — except on the Community page, which has always had them.
 */
export type CircleFeature = "documents" | "wiki" | "tasks" | "polls";

const onByDefault = (circle: Pick<Circle, "id"> | undefined, feature: CircleFeature) => feature !== "polls" || circle?.id === "community";

export const featureEnabled = (circle: Pick<Circle, "id" | "features"> | undefined, feature: CircleFeature) =>
  circle?.features?.[feature] ?? onByDefault(circle, feature);
