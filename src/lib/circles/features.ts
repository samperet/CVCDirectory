import type { Circle } from "@/lib/directory/types";

/** Features a circle can turn on or off for itself. Each is on unless the circle turns it off. */
export type CircleFeature = "documents" | "wiki" | "tasks";

export const featureEnabled = (circle: Pick<Circle, "features"> | undefined, feature: CircleFeature) => circle?.features?.[feature] !== false;
