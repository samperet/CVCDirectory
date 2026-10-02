import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readBinary } from "@/lib/storage";
import { isPersonId, photoKey } from "@/lib/profiles/store";
import { problem } from "@/lib/http";
import { PRIVATE_IMAGE_HEADERS } from "@/lib/images";
import { removeProfilePhoto, uploadProfilePhoto } from "@/lib/profiles/handlers";

export const dynamic = "force-dynamic";

/** A resident's profile photo, for signed-in residents. URLs carry a version, so caching is safe. */
export async function GET(_request: Request, { params }: { params: { personId: string } }) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view photos", 401);
  if (!isPersonId(params.personId)) return problem("Photo not found", 404);

  const photo = await readBinary(photoKey(params.personId));
  if (!photo) return problem("Photo not found", 404);

  return new NextResponse(photo.bytes as unknown as BodyInit, {
    headers: { "Content-Type": photo.contentType, ...PRIVATE_IMAGE_HEADERS },
  });
}

/** Upload a resident's photo: that resident, or an admin. */
export function POST(request: NextRequest, { params }: { params: { personId: string } }) {
  return uploadProfilePhoto(request, params.personId);
}

/** Remove a resident's photo: that resident, or an admin. */
export function DELETE(_request: Request, { params }: { params: { personId: string } }) {
  return removeProfilePhoto(params.personId);
}
