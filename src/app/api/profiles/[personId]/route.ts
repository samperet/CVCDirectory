import { NextRequest } from "next/server";
import { getProfile, patchProfile } from "@/lib/profiles/handlers";

export const dynamic = "force-dynamic";

type Params = { params: { personId: string } };

/** A resident's editable entry: for that resident or an admin. */
export function GET(_request: Request, { params }: Params) {
  return getProfile(params.personId);
}

/** Edit a resident's entry: that resident, or an admin (who can reset phone numbers). */
export function PATCH(request: NextRequest, { params }: Params) {
  return patchProfile(request, params.personId);
}
