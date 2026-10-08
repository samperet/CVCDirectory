import { NextRequest, NextResponse } from "next/server";
import { financesContext, financesProblem } from "@/lib/finances/http";
import { budgetInputSchema, setBudget } from "@/lib/finances/store";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Set a year's budget — `{ year, amount (cents), note? }` — or take it away (`amount: null`). */
export async function PUT(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "finances");
  if (limited) return limited;
  const ctx = await financesContext(params.id, { edit: true });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, budgetInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await setBudget(params.id, ctx.actor, parsed.data);
  return result.ok ? NextResponse.json({ budget: result.value }) : financesProblem(result.reason);
}
