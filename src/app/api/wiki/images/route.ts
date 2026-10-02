import { NextRequest, NextResponse } from "next/server";
import { MAX_WIKI_IMAGE_BYTES, saveWikiImage, wikiImageUrl } from "@/lib/wiki/images";
import { pageContext } from "@/lib/wiki/http";
import { sniffImageType } from "@/lib/images";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Add a photo to a page (`?page=<slug>`; its editors): the image as the raw request body (JPEG, PNG, or WebP). Kept with the page's keeper circle's photos. */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "wiki-image");
  if (limited) return limited;
  const ctx = await pageContext(request.nextUrl.searchParams.get("page") ?? "", "edit");
  if ("error" in ctx) return ctx.error;
  const tooBig = problem("Photos must be 3 MB or smaller", 413);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_WIKI_IMAGE_BYTES) return tooBig;
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_WIKI_IMAGE_BYTES) return tooBig;
  const contentType = sniffImageType(bytes);
  if (!contentType) return problem("Choose a JPEG, PNG, or WebP image");
  const id = await saveWikiImage(ctx.page.keeper, bytes, contentType, ctx.user.name);
  if (!id) return problem("This circle has as many wiki photos as it can hold", 409);
  return NextResponse.json({ url: wikiImageUrl(ctx.page.keeper, id) }, { status: 201 });
}
