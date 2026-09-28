import { NextRequest } from "next/server";
import { sniffImageType } from "@/lib/images";
import { MAX_PHOTO_BYTES, captionSchema } from "@/lib/photos/store";
import { problem } from "@/lib/http";

/**
 * Read a photo upload: the image is the raw request body (JPEG, PNG, or
 * WebP, checked by its bytes) and the caption is the `caption` query value.
 */
export async function readPhotoUpload(request: NextRequest) {
  const caption = captionSchema.safeParse(request.nextUrl.searchParams.get("caption") ?? "");
  if (!caption.success) return { error: problem(caption.error.errors[0].message) } as const;

  const tooBig = () => ({ error: problem("Photo must be 4 MB or smaller", 413, "Payload Too Large") }) as const;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES) return tooBig();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_PHOTO_BYTES) return tooBig();
  if (!bytes.length) return { error: problem("Choose a photo to upload") } as const;

  const contentType = sniffImageType(bytes);
  if (!contentType) return { error: problem("Upload a JPEG, PNG, or WebP image", 415, "Unsupported Media Type") } as const;
  return { file: { bytes, contentType }, caption: caption.data } as const;
}
