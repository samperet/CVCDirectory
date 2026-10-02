import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { excerpt, notify } from "@/lib/push/notify";
import { addPhoto, listPhotos } from "@/lib/photos/store";
import { readPhotoUpload } from "@/lib/photos/upload";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { photos: await listPhotos() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Add a photo: the image as the raw request body, with an optional `?caption=`. */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "photos");
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return problem("Sign in to add photos", 401);

  const upload = await readPhotoUpload(request);
  if ("error" in upload) return upload.error;

  const photo = await addPhoto({ id: user.id, name: user.name }, upload.file, upload.caption);
  if (photo === "full") return problem("The photo gallery is full", 409);
  // Several photos added at once replace each other on a device rather than piling up.
  await notify({
    topic: "photos",
    title: `New photo from ${user.name}`,
    body: photo.caption ? excerpt(photo.caption) : "Take a look in Photos.",
    url: "/photos",
    tag: `photos-${user.id}`,
    exceptUserId: user.id,
  });
  return NextResponse.json({ photo }, { status: 201 });
}
