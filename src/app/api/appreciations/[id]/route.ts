import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { removeAppreciation } from "@/lib/appreciations/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Delete an appreciation: any signed-in resident may. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to remove an appreciation", 401, "Unauthorized");

  const result = await removeAppreciation(params.id);
  if (result === "not_found") return problem("Appreciation not found", 404, "Not Found");
  return NextResponse.json({ ok: true });
}
