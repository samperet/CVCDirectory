import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/actor";
import { loanItemUpdateSchema, removeLoanItem, updateLoanItem } from "@/lib/library/store";
import { loanProblem } from "@/lib/library/http";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to update an item", 401);

  const parsed = await readBody(request, loanItemUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await updateLoanItem(actorOf(user), params.id, parsed.data);
  return result.ok ? NextResponse.json({ item: result.value }) : loanProblem(result.reason);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to remove an item", 401);

  const result = await removeLoanItem(actorOf(user), params.id);
  return result.ok ? NextResponse.json({ ok: true }) : loanProblem(result.reason);
}
