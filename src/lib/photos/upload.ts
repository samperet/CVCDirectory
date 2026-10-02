import { NextRequest } from "next/server";
import { readImageUpload } from "@/lib/images";
import { MAX_PHOTO_BYTES, captionSchema } from "@/lib/photos/store";
import { problem } from "@/lib/http";

/**
 * Read a photo upload: the image is the raw request body (JPEG, PNG, or
 * WebP, checked by its bytes) and the caption is the `caption` query value.
 */
export async function readPhotoUpload(request: NextRequest) {
  const caption = captionSchema.safeParse(request.nextUrl.searchParams.get("caption") ?? "");
  if (!caption.success) return { error: problem(caption.error.errors[0].message) } as const;

  const upload = await readImageUpload(request, { maxBytes: MAX_PHOTO_BYTES, label: "Photo" });
  if ("error" in upload) return upload;
  return { file: upload.file, caption: caption.data } as const;
}
