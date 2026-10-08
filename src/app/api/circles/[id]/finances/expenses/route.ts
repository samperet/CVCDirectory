import { NextRequest, NextResponse } from "next/server";
import { financesContext, financesProblem } from "@/lib/finances/http";
import { addExpense, expenseInputSchema } from "@/lib/finances/store";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Record an expense (or a refund: a negative amount); its receipt follows with `PUT …/receipt`. Nobody is notified. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "finances");
  if (limited) return limited;
  const ctx = await financesContext(params.id, { edit: true });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, expenseInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await addExpense(params.id, ctx.actor, parsed.data);
  return result.ok
    ? NextResponse.json({ expense: result.value }, { status: 201 })
    : financesProblem(result.reason);
}
