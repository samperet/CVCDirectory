import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteBinary, mutateJson, readJson, writeBinary } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";

/**
 * Community photos. Each image is a binary object (`photos/files/<id>`) with
 * its details in one index document. Residents add photos, and any resident
 * can remove one. Captions are edited by whoever added the photo, or an
 * admin (photos seeded through the admin API have no uploader, so only
 * admins edit theirs).
 */

export interface Photo {
  id: string;
  caption: string;
  contentType: string;
  size: number;
  uploaderId: string | null;
  uploaderName: string | null;
  createdAt: string;
}

/** Room for large phone photos after they're downscaled in the browser, under Vercel's 4.5 MB request cap. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS = 2000;
const KEY = "photos/index.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const captionSchema = z.string().trim().max(300, "Caption must be 300 characters or fewer");

/** Photo ids come from URLs and become storage keys, so only UUIDs are accepted. */
export function isPhotoId(id: string) {
  return UUID.test(id);
}

export function photoFileKey(id: string) {
  if (!isPhotoId(id)) throw new Error("Invalid photo id");
  return `photos/files/${id}`;
}

function normalize(raw: unknown): Photo[] {
  const photos = (raw as { photos?: unknown } | null)?.photos;
  return Array.isArray(photos) ? (photos as Photo[]) : [];
}

/** Newest first. */
export async function listPhotos(): Promise<Photo[]> {
  return [...normalize(await readJson(KEY))].reverse();
}

export async function addPhoto(
  uploader: Pick<Actor, "userId" | "name"> | null,
  file: { bytes: Uint8Array; contentType: string },
  caption: string
): Promise<Photo | "full"> {
  const photo: Photo = {
    id: randomUUID(),
    caption,
    contentType: file.contentType,
    size: file.bytes.length,
    uploaderId: uploader?.userId ?? null,
    uploaderName: uploader?.name ?? null,
    createdAt: new Date().toISOString(),
  };
  // The file first, so the index never names a photo that isn't there; taken back if there's no room.
  await writeBinary(photoFileKey(photo.id), file);
  const result = await mutateJson<Photo | "full">(KEY, (raw) => {
    const photos = normalize(raw);
    if (photos.length >= MAX_PHOTOS) return { write: false, result: "full" };
    return { value: { photos: [...photos, photo] }, result: photo };
  });
  if (result === "full") await deleteBinary(photoFileKey(photo.id));
  return result;
}

type Editor = Pick<Actor, "userId" | "admin">;
const mayChange = (photo: Photo, actor: Editor) =>
  actor.admin || (photo.uploaderId !== null && photo.uploaderId === actor.userId);

export async function updateCaption(
  id: string,
  actor: Editor,
  caption: string
): Promise<Photo | "not_found" | "forbidden"> {
  return mutateJson<Photo | "not_found" | "forbidden">(KEY, (raw) => {
    const photos = normalize(raw);
    const index = photos.findIndex((photo) => photo.id === id);
    if (index === -1) return { write: false, result: "not_found" };
    if (!mayChange(photos[index], actor)) return { write: false, result: "forbidden" };
    const updated = [...photos];
    updated[index] = { ...photos[index], caption };
    return { value: { photos: updated }, result: updated[index] };
  });
}

/** Remove a photo. Any signed-in resident may. */
export async function removePhoto(id: string): Promise<"removed" | "not_found"> {
  const result = await mutateJson<"removed" | "not_found">(KEY, (raw) => {
    const photos = normalize(raw);
    if (!photos.some((entry) => entry.id === id)) return { write: false, result: "not_found" };
    return { value: { photos: photos.filter((entry) => entry.id !== id) }, result: "removed" };
  });
  if (result === "removed") await deleteBinary(photoFileKey(id));
  return result;
}
