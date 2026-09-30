import type { Circle } from "@/lib/directory/types";

/** Features a circle can turn on or off for itself. Both are on unless the circle turns one off. */
export type CircleFeature = "documents" | "wiki";

export const featureEnabled = (circle: Pick<Circle, "features"> | undefined, feature: CircleFeature) => circle?.features?.[feature] !== false;
