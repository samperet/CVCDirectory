import { randomUUID } from "crypto";
import { deleteBinary, mutateJson, readBinary, readJson, writeBinary } from "@/lib/storage";

/**
 * Photos in a circle's wiki pages. Each is stored on its own
 * (`wiki-images/<circleId>/<id>`), with a list of a circle's photos
 * (`wiki-images/<circleId>.json`) so they can go when the circle does.
 * Pages refer to them as `/api/circles/<circleId>/wiki/images/<id>`.
 */

export const MAX_WIKI_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGES = 2000;

export const isImageId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export const imageKey = (circleId: string, id: string) => `wiki-images/${circleId}/${id}`;
const listKey = (circleId: string) => `wiki-images/${circleId}.json`;
export const wikiImageUrl = (circleId: string, id: string) =>
  `/api/circles/${circleId}/wiki/images/${id}`;

interface ImageEntry {
  id: string;
  contentType: string;
  uploadedBy: string;
  uploadedAt: string;
}

const normalize = (raw: unknown): ImageEntry[] => {
  const images = (raw as { images?: unknown } | null)?.images;
  return Array.isArray(images) ? (images as ImageEntry[]) : [];
};

export async function saveWikiImage(
  circleId: string,
  bytes: Uint8Array,
  contentType: string,
  uploadedBy: string
) {
  const id = randomUUID();
  // The file first, so the list never names a photo that isn't there; taken back if there's no room.
  await writeBinary(imageKey(circleId, id), { bytes, contentType });
  const entry: ImageEntry = { id, contentType, uploadedBy, uploadedAt: new Date().toISOString() };
  const saved = await mutateJson<string | null>(listKey(circleId), (raw) => {
    const images = normalize(raw);
    if (images.length >= MAX_IMAGES) return { write: false, result: null };
    return { value: { images: [...images, entry] }, result: id };
  });
  if (!saved) await deleteBinary(imageKey(circleId, id));
  return saved;
}

export function readWikiImage(circleId: string, id: string) {
  return readBinary(imageKey(circleId, id));
}

/** A circle's photos: each one's id and type (for an export of its pages). */
export async function listWikiImages(circleId: string) {
  return normalize(await readJson(listKey(circleId))).map(({ id, contentType }) => ({
    id,
    contentType,
  }));
}
