import type { Circle } from "@/lib/directory/types";

/**
 * The two circles every CVC directory has, by id — safe to import anywhere
 * (the circle store itself is server-only).
 */

/** The Community circle: everyone who lives at CVC, with no member list. */
export const COMMUNITY_ID = "community";
/** The Board, whose members can manage every circle. */
export const BOARD_ID = "board";

export const isCommunity = (circleId: string) => circleId === COMMUNITY_ID;

/** Whether a resident sits on the Board. */
export const sitsOnBoard = (circles: Pick<Circle, "id" | "seats">[], personId: string | null | undefined) =>
  !!personId && circles.some((circle) => circle.id === BOARD_ID && circle.seats.some((seat) => seat.personId === personId));
