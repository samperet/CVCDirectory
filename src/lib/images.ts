import type { NextResponse } from "next/server";
import { problem } from "@/lib/http";

/**
 * Images residents upload — profile and home photos, circle icons, wiki and
 * gallery photos — are the raw request body (JPEG, PNG, or WebP), checked by
 * their bytes rather than the declared type, and kept in storage as binaries.
 */

/** The image's type from its first bytes, or null for anything that isn't a JPEG, PNG, or WebP. */
export function sniffImageType(
  bytes: Uint8Array
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const MAX_IMAGE_BYTES = 1024 * 1024;

/** Headers for serving a stored image to signed-in residents; URLs are versioned, so caching is safe. */
export const PRIVATE_IMAGE_HEADERS = {
  "Cache-Control": "private, max-age=86400",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
};

export interface ImageFile {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

/**
 * Read an uploaded image from the request body: too large (by the declared
 * length, then the bytes) is a 413, anything that isn't a JPEG, PNG, or WebP
 * a 415. `label` names it in the messages ("Photo", "Icon").
 */
export async function readImageUpload(
  request: Request,
  { maxBytes, label }: { maxBytes: number; label: string }
): Promise<{ file: ImageFile } | { error: NextResponse }> {
  const tooBig = () =>
    ({
      error: problem(`${label} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller`, 413),
    }) as const;
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return tooBig();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > maxBytes) return tooBig();
  if (!bytes.length) return { error: problem(`Choose a ${label.toLowerCase()} to upload`) };
  const contentType = sniffImageType(bytes);
  if (!contentType) return { error: problem("Upload a JPEG, PNG, or WebP image", 415) };
  return { file: { bytes, contentType } };
}
