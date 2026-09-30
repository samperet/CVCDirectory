import { NextRequest, NextResponse } from "next/server";
import { createHome, homeInputSchema, listHomes } from "@/lib/homes/store";
import { homesManager } from "@/lib/homes/access";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Every listing, sold ones included (admins and the Board). */
export async function GET() {
  const ctx = await homesManager();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ homes: await listHomes() }, { headers: { "Cache-Control": "private, no-store" } });
}

/** List a home for sale (admins and the Board). */
export async function POST(request: NextRequest) {
  const ctx = await homesManager();
  if ("error" in ctx) return ctx.error;
  const parsed = homeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await createHome(parsed.data, ctx.user.name);
  return result.ok ? NextResponse.json({ home: result.home }, { status: 201 }) : problem("There are too many listings — remove sold ones first", 409, "Conflict");
}
