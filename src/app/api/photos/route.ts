import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { addPhoto, listPhotos } from "@/lib/photos/store";
import { readPhotoUpload } from "@/lib/photos/upload";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ photos: await listPhotos() }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Add a photo: the image as the raw request body, with an optional `?caption=`. */
export async function POST(request: NextRequest) {
  if (!rateLimit(`photos:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const user = await getSessionUser();
  if (!user) return problem("Sign in to add photos", 401, "Unauthorized");

  const upload = await readPhotoUpload(request);
  if ("error" in upload) return upload.error;

  const photo = await addPhoto({ id: user.id, name: user.name }, upload.file, upload.caption);
  if (photo === "full") return problem("The photo gallery is full", 409, "Conflict");
  return NextResponse.json({ photo }, { status: 201 });
}
