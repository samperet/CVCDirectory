import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readBinary } from "@/lib/storage";
import { isPersonId, photoKey } from "@/lib/profiles/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A resident's profile photo, for signed-in residents. URLs carry a version, so caching is safe. */
export async function GET(_request: Request, { params }: { params: { personId: string } }) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view photos", 401, "Unauthorized");
  if (!isPersonId(params.personId)) return problem("Photo not found", 404, "Not Found");

  const photo = await readBinary(photoKey(params.personId));
  if (!photo) return problem("Photo not found", 404, "Not Found");

  return new NextResponse(photo.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
