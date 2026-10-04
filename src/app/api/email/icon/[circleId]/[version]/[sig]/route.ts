import { NextResponse } from "next/server";
import { iconKey, isCircleId, readCircleIcons } from "@/lib/circles/icons";
import { checkIconSignature } from "@/lib/groups/tokens";
import { readBinary } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: { circleId: string; version: string; sig: string } };

/**
 * A circle's icon for emails: mail apps load images without signing in, so
 * this address is public but signed (it can't be guessed for a circle, and
 * changes with the icon), and cached for good.
 */
export async function GET(_request: Request, { params }: Params) {
  const { circleId, version, sig } = params;
  const notFound = () => new NextResponse("Not found", { status: 404 });
  if (!isCircleId(circleId) || !/^[0-9a-z]{1,16}$/.test(version)) return notFound();
  if (!checkIconSignature(circleId, version, sig.replace(/\.(png|jpe?g|webp)$/, "")))
    return notFound();
  if (!(await readCircleIcons())[circleId]) return notFound();
  const icon = await readBinary(iconKey(circleId));
  if (!icon) return notFound();
  return new NextResponse(icon.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": icon.contentType,
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
