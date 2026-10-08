import { NextRequest, NextResponse } from "next/server";
import { csvFileName, expensesCsv } from "@/lib/finances/csv";
import { financesContext, yearAsked } from "@/lib/finances/http";
import { expensesIn } from "@/lib/finances/shared";
import { readFinances } from "@/lib/finances/store";
import { problem } from "@/lib/http";
import type { NamedPerson } from "@/lib/people";
import { contentDisposition } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * A year's expenses as a spreadsheet (CSV), for whoever can see the circle's
 * finances: "land-care-circle-expenses-2026.csv". Residents who paid are
 * named as the directory names them now.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await financesContext(params.id);
  if ("error" in ctx) return ctx.error;
  const year = yearAsked(request.nextUrl.searchParams);
  if (!year) return problem("Choose a year like 2026");
  const { expenses } = await readFinances(params.id);
  const nameOf = (person: NamedPerson) =>
    (person.personId &&
      ctx.directory.people.find((entry) => entry.id === person.personId)?.displayName) ||
    person.name;
  return new NextResponse(expensesCsv(expensesIn(expenses, year), nameOf), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(csvFileName(ctx.circle.name, year), false),
      "Cache-Control": "private, no-store",
    },
  });
}
