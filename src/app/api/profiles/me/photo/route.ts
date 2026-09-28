import { NextRequest } from "next/server";
import { removeProfilePhoto, uploadProfilePhoto } from "@/lib/profiles/handlers";

export const dynamic = "force-dynamic";

/** Upload your profile photo as the raw request body (JPEG, PNG, or WebP). */
export function POST(request: NextRequest) {
  return uploadProfilePhoto(request, null);
}

export function DELETE() {
  return removeProfilePhoto(null);
}
