import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminToken as authorize } from "@/lib/auth/admin-token";
import { iconKey, isCircleId, readCircleIcons, setCircleIcon } from "@/lib/circles/icons";
import { MAX_IMAGE_BYTES, readImageUpload } from "@/lib/images";
import { readBinary, writeBinary } from "@/lib/storage";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Admin upkeep of circle icons, behind `Authorization: Bearer <ADMIN_TOKEN>`.
 * GET lists which circles have one (or, with `?circle=<id>`, returns that
 * circle's icon image); POST `{ from, to }` copies one circle's
 * icon to another; PUT `?circle=<id>` with an image body (JPEG, PNG, WebP)
 * sets a circle's icon.
 */
export async function GET(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  const circle = request.nextUrl.searchParams.get("circle");
  if (circle) {
    const icon = isCircleId(circle) ? await readBinary(iconKey(circle)) : null;
    if (!icon) return problem("Icon not found", 404);
    return new NextResponse(icon.bytes as unknown as BodyInit, {
      headers: { "Content-Type": icon.contentType, "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.json({ icons: await readCircleIcons() });
}

const copySchema = z.object({
  from: z.string().refine(isCircleId),
  to: z.string().refine(isCircleId),
});

export async function POST(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  const parsed = copySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Give `from` and `to` circle ids");
  const icon = await readBinary(iconKey(parsed.data.from));
  if (!icon) return problem(`${parsed.data.from} has no icon`, 404);
  await writeBinary(iconKey(parsed.data.to), icon);
  await setCircleIcon(parsed.data.to, {
    contentType: icon.contentType,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, copied: parsed.data, bytes: icon.bytes.length });
}

export async function PUT(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  const circle = request.nextUrl.searchParams.get("circle") ?? "";
  if (!isCircleId(circle)) return problem("Give ?circle=<id>");
  const upload = await readImageUpload(request, { maxBytes: MAX_IMAGE_BYTES, label: "Icon" });
  if ("error" in upload) return upload.error;
  await writeBinary(iconKey(circle), upload.file);
  await setCircleIcon(circle, {
    contentType: upload.file.contentType,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, circle, bytes: upload.file.bytes.length });
}
