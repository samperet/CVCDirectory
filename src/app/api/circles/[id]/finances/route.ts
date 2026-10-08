import { NextRequest, NextResponse } from "next/server";
import { financesContext, yearAsked } from "@/lib/finances/http";
import { financesFor, type FinancesView } from "@/lib/finances/shared";
import { readFinances } from "@/lib/finances/store";
import { problem } from "@/lib/http";
import { todayInVermont } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * A circle's finances for a year (`?year=`, this year by default): its
 * budget, its expenses (newest first) and their totals, what's still owed
 * (from any year), the categories used, the years there are — and whether
 * you can change them. 403 for someone the module's setting leaves out.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await financesContext(params.id);
  if ("error" in ctx) return ctx.error;
  const year = yearAsked(request.nextUrl.searchParams);
  if (!year) return problem("Choose a year like 2026");
  const view: FinancesView = {
    ...financesFor(await readFinances(params.id), year, todayInVermont().slice(0, 4)),
    canEdit: ctx.canEdit,
    view: ctx.view,
  };
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}
