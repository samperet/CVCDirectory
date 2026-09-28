import { NextRequest } from "next/server";
import { getProfile, patchProfile } from "@/lib/profiles/handlers";

export const dynamic = "force-dynamic";

/** Your own directory entry. */
export function GET() {
  return getProfile(null);
}

/** Edit your own entry; changing a phone number requires your current one. */
export function PATCH(request: NextRequest) {
  return patchProfile(request, null);
}
