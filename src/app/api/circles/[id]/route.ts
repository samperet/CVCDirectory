import { NextRequest, NextResponse } from "next/server";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { circleUpdateSchema, deleteCircle, updateCircle } from "@/lib/circles/store";
import { iconKey, setCircleIcon } from "@/lib/circles/icons";
import { deleteBinary } from "@/lib/storage";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Edit a circle's name or description (its members or the Board). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;

  const parsed = circleUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));

  const result = await updateCircle(ctx.imported, params.id, parsed.data);
  return result.ok ? NextResponse.json({ circle: result.value }) : circleProblem(result.reason);
}

/** Delete a circle (the Board only); the Board itself can't be deleted. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id, require: "board" });
  if ("error" in ctx) return ctx.error;
  if (params.id === "board") return problem("The Board can't be deleted", 409, "Conflict");

  const result = await deleteCircle(ctx.imported, params.id);
  if (!result.ok) return circleProblem(result.reason);
  await deleteBinary(iconKey(params.id));
  await setCircleIcon(params.id, null);
  return NextResponse.json({ ok: true });
}
