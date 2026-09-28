import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { readBinary } from "@/lib/storage";
import { captionSchema, isPhotoId, photoFileKey, removePhoto, updateCaption } from "@/lib/photos/store";
import { PRIVATE_IMAGE_HEADERS } from "@/lib/images";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** The image itself, for signed-in residents. A photo's bytes never change, so it caches well. */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view photos", 401, "Unauthorized");
  if (!isPhotoId(params.id)) return problem("Photo not found", 404, "Not Found");

  const file = await readBinary(photoFileKey(params.id));
  if (!file) return problem("Photo not found", 404, "Not Found");
  return new NextResponse(file.bytes as unknown as BodyInit, {
    headers: { "Content-Type": file.contentType, ...PRIVATE_IMAGE_HEADERS },
  });
}

/** Edit a caption: whoever added the photo, or an admin. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to edit photos", 401, "Unauthorized");
  if (!isPhotoId(params.id)) return problem("Photo not found", 404, "Not Found");

  const body = (await request.json().catch(() => null)) as { caption?: unknown } | null;
  const caption = captionSchema.safeParse(body?.caption ?? "");
  if (!caption.success) return problem(caption.error.errors[0].message);

  const result = await updateCaption(params.id, { id: user.id, admin: isAdmin(user) }, caption.data);
  if (result === "not_found") return problem("Photo not found", 404, "Not Found");
  if (result === "forbidden") return problem("Only the person who added this photo can edit it", 403, "Forbidden");
  return NextResponse.json({ photo: result });
}

/** Remove a photo: whoever added it, or an admin. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to remove photos", 401, "Unauthorized");
  if (!isPhotoId(params.id)) return problem("Photo not found", 404, "Not Found");

  const result = await removePhoto(params.id, { id: user.id, admin: isAdmin(user) });
  if (result === "not_found") return problem("Photo not found", 404, "Not Found");
  if (result === "forbidden") return problem("Only the person who added this photo can remove it", 403, "Forbidden");
  return NextResponse.json({ ok: true });
}
