/** Identify an uploaded image from its bytes rather than trusting the declared type. */
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
