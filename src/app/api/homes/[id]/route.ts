import { NextRequest, NextResponse } from "next/server";
import { deleteHome, homeInputSchema, isHomeId, updateHome } from "@/lib/homes/store";
import { homesManager } from "@/lib/homes/access";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };
const notFound = () => problem("That listing no longer exists", 404, "Not Found");

/** Edit a listing, or change its status (admins and the Board). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await homesManager();
  if ("error" in ctx) return ctx.error;
  if (!isHomeId(params.id)) return notFound();
  const parsed = homeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await updateHome(params.id, parsed.data, ctx.user.name);
  return result.ok ? NextResponse.json({ home: result.home }) : notFound();
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await homesManager();
  if ("error" in ctx) return ctx.error;
  if (!isHomeId(params.id)) return notFound();
  const result = await deleteHome(params.id);
  return result.ok ? NextResponse.json({ ok: true }) : notFound();
}
