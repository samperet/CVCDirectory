import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { removeAppreciation } from "@/lib/appreciations/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Delete your own appreciation; admins can delete any. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to remove an appreciation", 401, "Unauthorized");

  const result = await removeAppreciation(params.id, { id: user.id, admin: isAdmin(user) });
  if (result === "not_found") return problem("Appreciation not found", 404, "Not Found");
  if (result === "forbidden") return problem("You can only remove your own appreciations", 403, "Forbidden");
  return NextResponse.json({ ok: true });
}
