import { mutateJson, readJson } from "@/lib/storage";
import type { Circle, DirectoryDocument } from "@/lib/directory/types";
import { BOARD_ID } from "./ids";

/**
 * Circle icons: one uploaded image per circle, stored as a binary object with
 * a small metadata document recording which circles have one. Members of a
 * circle — and the Board, so empty circles can get one too — may change it.
 */

interface IconMeta {
  contentType: string;
  updatedAt: string;
}

const KEY = "circles/icons.json";

/** Circle ids come from URLs and become storage keys. */
export function isCircleId(id: string) {
  return /^[a-z0-9-]{1,40}$/.test(id);
}

export function iconKey(circleId: string) {
  if (!isCircleId(circleId)) throw new Error("Invalid circle id");
  return `circles/icons/${circleId}`;
}

function normalize(raw: unknown): Record<string, IconMeta> {
  const doc = raw as { icons?: Record<string, IconMeta> } | null;
  return doc?.icons && typeof doc.icons === "object" ? doc.icons : {};
}

export async function readCircleIcons(): Promise<Record<string, IconMeta>> {
  return normalize(await readJson(KEY));
}

export async function setCircleIcon(circleId: string, meta: IconMeta | null): Promise<void> {
  await mutateJson(KEY, (raw) => {
    const { [circleId]: _old, ...rest } = normalize(raw);
    return { value: { icons: meta ? { ...rest, [circleId]: meta } : rest }, result: null };
  });
}

export function applyCircleIcon(circle: Circle, meta: IconMeta | undefined): Circle {
  return {
    ...circle,
    iconUrl: meta ? `/api/circles/${circle.id}/icon?v=${encodeURIComponent(meta.updatedAt)}` : null,
  };
}

/** Whether a person holds a seat on a circle whose position matches (e.g. /secretary/i). */
export function holdsSeat(
  directory: DirectoryDocument,
  circleId: string,
  personId: string,
  position: RegExp
): boolean {
  const circle = directory.circles.find((entry) => entry.id === circleId);
  return !!circle?.seats.some(
    (seat) => seat.personId === personId && position.test(seat.position ?? "")
  );
}

/** Whether a resident may manage a circle (details, members, icon): they're in it, or on the Board. */
export function canManageCircle(
  directory: DirectoryDocument,
  circleId: string,
  personId: string
): boolean {
  return directory.circles.some(
    (circle) =>
      (circle.id === circleId || circle.id === BOARD_ID) &&
      circle.seats.some((seat) => seat.personId === personId)
  );
}
