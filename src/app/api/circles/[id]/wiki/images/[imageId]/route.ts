import { NextResponse } from "next/server";
import { isImageId, readWikiImage } from "@/lib/wiki/images";
import { wikiSession } from "@/lib/wiki/http";
import { PRIVATE_IMAGE_HEADERS } from "@/lib/images";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A photo in a wiki page (kept with its circle's photos): any signed-in resident (a photo never changes, so it caches). */
export async function GET(_request: Request, { params }: { params: { id: string; imageId: string } }) {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const image = isImageId(params.imageId) ? await readWikiImage(params.id, params.imageId) : null;
  if (!image) return problem("Photo not found", 404);
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: { "Content-Type": image.contentType, ...PRIVATE_IMAGE_HEADERS, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
