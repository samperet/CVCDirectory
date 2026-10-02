import { NextRequest, NextResponse } from "next/server";
import { MAX_HOME_PHOTO_BYTES, getHome, isHomeId, photoKey, setHomePhoto } from "@/lib/homes/store";
import { homesManager } from "@/lib/homes/access";
import { sniffImageType } from "@/lib/images";
import { readBinary } from "@/lib/storage";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };
const notFound = () => problem("Photo not found", 404);

/** A listing's photo — public (it's on the public homepage); once the home has sold, only admins and the Board see it. */
export async function GET(_request: Request, { params }: Params) {
  if (!isHomeId(params.id)) return notFound();
  const home = await getHome(params.id);
  if (!home?.photo) return notFound();
  const sold = home.status === "sold";
  if (sold && "error" in (await homesManager())) return notFound();
  const image = await readBinary(photoKey(params.id));
  if (!image) return notFound();
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": sold ? "private, no-store" : "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Add or replace the photo: the image as the raw request body (admins and the Board). */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await homesManager();
  if ("error" in ctx) return ctx.error;
  if (!isHomeId(params.id) || !(await getHome(params.id))) return notFound();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_HOME_PHOTO_BYTES)
    return problem("Photos must be 3 MB or smaller", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_HOME_PHOTO_BYTES) return problem("Photos must be 3 MB or smaller", 413);
  const contentType = sniffImageType(bytes);
  if (!contentType) return problem("Upload a JPEG, PNG, or WebP image", 415);
  const result = await setHomePhoto(params.id, { bytes, contentType }, ctx.user.name);
  return result.ok ? NextResponse.json({ home: result.home }, { status: 201 }) : notFound();
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await homesManager();
  if ("error" in ctx) return ctx.error;
  if (!isHomeId(params.id)) return notFound();
  const result = await setHomePhoto(params.id, null, ctx.user.name);
  return result.ok ? NextResponse.json({ home: result.home }) : notFound();
}
