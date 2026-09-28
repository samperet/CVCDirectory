import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import { canManageCircle, iconKey, isCircleId, setCircleIcon } from "@/lib/circles/icons";
import { deleteBinary, readBinary, writeBinary } from "@/lib/storage";
import { MAX_IMAGE_BYTES, PRIVATE_IMAGE_HEADERS, sniffImageType } from "@/lib/images";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Resolve the circle and confirm the signed-in resident may change its icon. */
async function authorize(circleId: string) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to change a circle's icon", 401, "Unauthorized");
  const directory = await readDirectory();
  if (!isCircleId(circleId) || !directory?.circles.some((circle) => circle.id === circleId)) {
    return problem("Circle not found", 404, "Not Found");
  }
  if (!canManageCircle(directory, circleId, user.personId)) {
    return problem("Only this circle's members or the Board can change its icon", 403, "Forbidden");
  }
  return null;
}

export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view circle icons", 401, "Unauthorized");
  if (!isCircleId(params.id)) return problem("Icon not found", 404, "Not Found");
  const icon = await readBinary(iconKey(params.id));
  if (!icon) return problem("Icon not found", 404, "Not Found");
  return new NextResponse(icon.bytes as unknown as BodyInit, {
    headers: { "Content-Type": icon.contentType, ...PRIVATE_IMAGE_HEADERS },
  });
}

/** Upload a circle icon as the raw request body (JPEG, PNG, or WebP). */
export async function POST(request: NextRequest, { params }: Params) {
  if (!rateLimit(`circle-icon:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const denied = await authorize(params.id);
  if (denied) return denied;

  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) {
    return problem("Icon must be 1 MB or smaller", 413, "Payload Too Large");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return problem("Icon must be 1 MB or smaller", 413, "Payload Too Large");
  const contentType = sniffImageType(bytes);
  if (!contentType) return problem("Upload a JPEG, PNG, or WebP image", 415, "Unsupported Media Type");

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
