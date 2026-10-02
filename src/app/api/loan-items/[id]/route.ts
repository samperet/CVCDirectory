import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { loanItemUpdateSchema, removeLoanItem, updateLoanItem } from "@/lib/library/store";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

function denied(reason: "not_found" | "forbidden") {
  return reason === "not_found"
    ? problem("Item not found", 404)
    : problem("Only the item's owner can change it", 403);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to update an item", 401);

  const parsed = await readBody(request, loanItemUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await updateLoanItem(
    { personId: user.personId, admin: isAdmin(user) },
    params.id,
    parsed.data
  );
  return result.ok ? NextResponse.json({ item: result.value }) : denied(result.reason);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to remove an item", 401);

  const result = await removeLoanItem({ personId: user.personId, admin: isAdmin(user) }, params.id);
  return result.ok ? NextResponse.json({ ok: true }) : denied(result.reason);
}
