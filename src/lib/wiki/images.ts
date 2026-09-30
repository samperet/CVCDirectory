import { randomUUID } from "crypto";
import { deleteBinary, deleteJson, enqueue, readBinary, readJson, writeBinary, writeJson } from "@/lib/storage";

/**
 * Photos in a circle's wiki pages. Each is stored on its own
 * (`wiki-images/<circleId>/<id>`), with a list of a circle's photos
 * (`wiki-images/<circleId>.json`) so they can go when the circle does.
 * Pages refer to them as `/api/circles/<circleId>/wiki/images/<id>`.
 */

export const MAX_WIKI_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGES = 2000;

export const isImageId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const imageKey = (circleId: string, id: string) => `wiki-images/${circleId}/${id}`;
const listKey = (circleId: string) => `wiki-images/${circleId}.json`;
export const wikiImageUrl = (circleId: string, id: string) => `/api/circles/${circleId}/wiki/images/${id}`;

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

export async function saveWikiImage(circleId: string, bytes: Uint8Array, contentType: string, uploadedBy: string) {
  return enqueue(listKey(circleId), async () => {
    const images = normalize(await readJson(listKey(circleId)));
    if (images.length >= MAX_IMAGES) return null;
    const id = randomUUID();
    await writeBinary(imageKey(circleId, id), { bytes, contentType });
    await writeJson(listKey(circleId), { images: [...images, { id, contentType, uploadedBy, uploadedAt: new Date().toISOString() }] });
    return id;
  });
}

export function readWikiImage(circleId: string, id: string) {
  return readBinary(imageKey(circleId, id));
}

/** Remove a circle's wiki photos (when the circle is deleted). */
export async function deleteWikiImages(circleId: string) {
  await enqueue(listKey(circleId), async () => {
    for (const image of normalize(await readJson(listKey(circleId)))) await deleteBinary(imageKey(circleId, image.id));
    await deleteJson(listKey(circleId));
  });
}
