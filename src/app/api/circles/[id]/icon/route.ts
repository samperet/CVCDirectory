import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { circleContext } from "@/lib/circles/access";
import { iconKey, isCircleId, setCircleIcon } from "@/lib/circles/icons";
import { deleteBinary, readBinary, writeBinary } from "@/lib/storage";
import { MAX_IMAGE_BYTES, PRIVATE_IMAGE_HEADERS, sniffImageType } from "@/lib/images";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Confirm the signed-in resident may change this circle's icon. */
async function authorize(circleId: string) {
  const ctx = await circleContext({ circleId, require: "member-or-board" });
  return "error" in ctx ? ctx.error : null;
}

export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view circle icons", 401);
  if (!isCircleId(params.id)) return problem("Icon not found", 404);
  const icon = await readBinary(iconKey(params.id));
  if (!icon) return problem("Icon not found", 404);
  return new NextResponse(icon.bytes as unknown as BodyInit, {
    headers: { "Content-Type": icon.contentType, ...PRIVATE_IMAGE_HEADERS },
  });
}

/** Upload a circle icon as the raw request body (JPEG, PNG, or WebP). */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "circle-icon");
  if (limited) return limited;
  const denied = await authorize(params.id);
  if (denied) return denied;

  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) {
    return problem("Icon must be 1 MB or smaller", 413);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return problem("Icon must be 1 MB or smaller", 413);
  const contentType = sniffImageType(bytes);
  if (!contentType) return problem("Upload a JPEG, PNG, or WebP image", 415);

  await writeBinary(iconKey(params.id), { bytes, contentType });
  await setCircleIcon(params.id, { contentType, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await authorize(params.id);
  if (denied) return denied;
  await deleteBinary(iconKey(params.id));
  await setCircleIcon(params.id, null);
  return NextResponse.json({ ok: true });
}
