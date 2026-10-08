import { NextResponse } from "next/server";
import { eggPhotoKey, readEggLog } from "@/lib/schedules/egg-store";
import { eggContext } from "@/lib/schedules/http";
import { PRIVATE_IMAGE_HEADERS } from "@/lib/images";
import { notFound } from "@/lib/http";
import { readBinary } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; photoId: string } };

/** A photo of the printed calendar that was sent to be read, for anyone signed in, while it's kept. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await eggContext(params.id);
  if ("error" in ctx) return ctx.error;
  const log = await readEggLog(params.id);
  if (!log.photos.some((photo) => photo.id === params.photoId)) return notFound("Photo");
  const image = await readBinary(eggPhotoKey(params.id, params.photoId));
  if (!image) return notFound("Photo");
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: { "Content-Type": image.contentType, ...PRIVATE_IMAGE_HEADERS },
  });
}
