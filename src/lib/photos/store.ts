import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteBinary, enqueue, readJson, writeBinary, writeJson } from "@/lib/storage";

/**
 * Community photos. Each image is a binary object (`photos/files/<id>`) with
 * its details in one index document. Residents add photos; the person who
 * added one (or an admin) can edit its caption or remove it. Photos seeded
 * through the admin API have no uploader, so only admins manage those.
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
  uploader: { id: string; name: string } | null,
  file: { bytes: Uint8Array; contentType: string },
  caption: string
): Promise<Photo | "full"> {
  const photo: Photo = {
    id: randomUUID(),
    caption,
    contentType: file.contentType,
    size: file.bytes.length,
    uploaderId: uploader?.id ?? null,
    uploaderName: uploader?.name ?? null,
    createdAt: new Date().toISOString(),
  };
  return enqueue(KEY, async () => {
    const photos = normalize(await readJson(KEY));
    if (photos.length >= MAX_PHOTOS) return "full" as const;
    await writeBinary(photoFileKey(photo.id), file);
    await writeJson(KEY, { photos: [...photos, photo] });
    return photo;
  });
}

type Actor = { id: string; admin: boolean };
const mayChange = (photo: Photo, actor: Actor) => actor.admin || (photo.uploaderId !== null && photo.uploaderId === actor.id);

export async function updateCaption(id: string, actor: Actor, caption: string): Promise<Photo | "not_found" | "forbidden"> {
  return enqueue(KEY, async () => {
    const photos = normalize(await readJson(KEY));
    const index = photos.findIndex((photo) => photo.id === id);
    if (index === -1) return "not_found" as const;
    if (!mayChange(photos[index], actor)) return "forbidden" as const;
    const updated = [...photos];
    updated[index] = { ...photos[index], caption };
    await writeJson(KEY, { photos: updated });
    return updated[index];
  });
}

export async function removePhoto(id: string, actor: Actor): Promise<"removed" | "not_found" | "forbidden"> {
  return enqueue(KEY, async () => {
    const photos = normalize(await readJson(KEY));
    const photo = photos.find((entry) => entry.id === id);
    if (!photo) return "not_found" as const;
    if (!mayChange(photo, actor)) return "forbidden" as const;
    await writeJson(KEY, { photos: photos.filter((entry) => entry.id !== id) });
    await deleteBinary(photoFileKey(id));
    return "removed" as const;
  });
}
