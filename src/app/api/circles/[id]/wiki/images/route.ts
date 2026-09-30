import { NextRequest, NextResponse } from "next/server";
import { MAX_WIKI_IMAGE_BYTES, saveWikiImage, wikiImageUrl } from "@/lib/wiki/images";
import { wikiContext } from "@/lib/wiki/http";
import { sniffImageType } from "@/lib/images";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Add a photo for the circle's wiki pages (its editors): the image as the raw request body (JPEG, PNG, or WebP). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(`wiki-image:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const ctx = await wikiContext(params.id, { edit: true });
  if ("error" in ctx) return ctx.error;
  const tooBig = problem("Photos must be 3 MB or smaller", 413, "Payload Too Large");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_WIKI_IMAGE_BYTES) return tooBig;
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_WIKI_IMAGE_BYTES) return tooBig;
  const contentType = sniffImageType(bytes);
  if (!contentType) return problem("Choose a JPEG, PNG, or WebP image");
  const id = await saveWikiImage(params.id, bytes, contentType, ctx.user.name);
  if (!id) return problem("This wiki has as many photos as it can hold", 409, "Conflict");
  return NextResponse.json({ url: wikiImageUrl(params.id, id) }, { status: 201 });
}
