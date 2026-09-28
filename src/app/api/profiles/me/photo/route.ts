import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { deleteBinary, writeBinary } from "@/lib/storage";
import { photoKey, updateProfile } from "@/lib/profiles/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES, sniffImageType } from "@/lib/images";

export const dynamic = "force-dynamic";

/** Upload your profile photo as the raw request body (JPEG, PNG, or WebP). */
export async function POST(request: NextRequest) {
  if (!rateLimit(`photo:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to upload a photo", 401, "Unauthorized");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return problem("Photo must be 1 MB or smaller", 413, "Payload Too Large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return problem("Photo must be 1 MB or smaller", 413, "Payload Too Large");

  const contentType = sniffImageType(bytes);
  if (!contentType) return problem("Upload a JPEG, PNG, or WebP image", 415, "Unsupported Media Type");

  await writeBinary(photoKey(user.personId), { bytes, contentType });
  const profile = await updateProfile(user.personId, { photo: { contentType, updatedAt: new Date().toISOString() } });
  return NextResponse.json({ photo: profile.photo }, { status: 201 });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to remove your photo", 401, "Unauthorized");
  await deleteBinary(photoKey(user.personId));
  await updateProfile(user.personId, { photo: null });
  return NextResponse.json({ ok: true });
}
