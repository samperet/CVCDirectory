import { NextRequest, NextResponse } from "next/server";
import { financesContext, financesProblem } from "@/lib/finances/http";
import { deleteExpense, expenseUpdateSchema, updateExpense } from "@/lib/finances/store";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; expenseId: string } };

/** Change an expense: any of its fields, including who paid and whether they've been paid back (`reimbursed: {date}` or null). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "finances");
  if (limited) return limited;
  const ctx = await financesContext(params.id, { edit: true, expenseId: params.expenseId });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, expenseUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const result = await updateExpense(params.id, params.expenseId, ctx.actor, parsed.data);
  return result.ok ? NextResponse.json({ expense: result.value }) : financesProblem(result.reason);
}

/** Delete an expense, and its receipt. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "finances");
  if (limited) return limited;
  const ctx = await financesContext(params.id, { edit: true, expenseId: params.expenseId });
  if ("error" in ctx) return ctx.error;
  const result = await deleteExpense(params.id, params.expenseId);
  return result.ok ? NextResponse.json({ ok: true }) : financesProblem(result.reason);
}
