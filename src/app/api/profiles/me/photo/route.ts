import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { deleteBinary, writeBinary } from "@/lib/storage";
import { photoKey, updateProfile } from "@/lib/profiles/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1024 * 1024; // the browser downsizes to ~400px first, so this is generous

/** Identify the image from its bytes rather than trusting the declared type. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Upload your profile photo as the raw request body (JPEG, PNG, or WebP). */
export async function POST(request: NextRequest) {
  if (!rateLimit(`photo:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to upload a photo", 401, "Unauthorized");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return problem("Photo must be 1 MB or smaller", 413, "Payload Too Large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_BYTES) return problem("Photo must be 1 MB or smaller", 413, "Payload Too Large");

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
