import type { DirectoryDocument } from "@/lib/directory/types";

/**
 * Alerts (safe for the browser): what a circle's Alert module sends — a
 * short message, to the circle's members or to everyone at CVC — as a push
 * notification and an email (topic `alerts`, which each resident can turn
 * off). Any resident can send one; only admins put an Alert module on a
 * circle's page. Each is kept, with who sent it, for everyone to see.
 */

export const ALERT_AUDIENCES = ["circle", "everyone"] as const;
export type AlertAudience = (typeof ALERT_AUDIENCES)[number];

/** Who an alert went to, in words ("Safety Crew", "Everyone at CVC"). */
export const audienceLabel = (audience: AlertAudience, circleName: string) =>
  audience === "everyone" ? "Everyone at CVC" : circleName;

export const MAX_ALERT = 500;

export interface AlertRecord {
  id: string;
  circleId: string;
  at: string;
  by: { userId: string; personId: string | null; name: string };
  audience: AlertAudience;
  message: string;
  /** How many residents it was sent to (whether or not they get alerts). */
  people: number;
}

/** The residents an alert goes to: the circle's members (each once), or everyone in the directory. */
export function audienceOf(
  directory: Pick<DirectoryDocument, "people" | "circles">,
  circleId: string,
  audience: AlertAudience
): string[] {
  if (audience === "everyone") return directory.people.map((person) => person.id);
  const seats = directory.circles.find((circle) => circle.id === circleId)?.seats ?? [];
  return Array.from(new Set(seats.map((seat) => seat.personId).filter((id): id is string => !!id)));
}
