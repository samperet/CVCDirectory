import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { addPhoto, listPhotos } from "@/lib/photos/store";
import { readPhotoUpload } from "@/lib/photos/upload";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Seed the photo gallery without a resident session. Requires
 * `Authorization: Bearer <ADMIN_TOKEN>`; the image is the raw request body,
 * with an optional `?caption=`. Seeded photos have no uploader, so only app
 * admins can edit or remove them.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  return NextResponse.json({ count: (await listPhotos()).length });
}

export async function POST(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;

  const upload = await readPhotoUpload(request);
  if ("error" in upload) return upload.error;

  const photo = await addPhoto(null, upload.file, upload.caption);
  if (photo === "full") return problem("The photo gallery is full", 409);
  return NextResponse.json({ photo: { id: photo.id, caption: photo.caption } }, { status: 201 });
}
