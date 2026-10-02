import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { readTypeMap, saveCircleTypes, typesFor } from "@/lib/documents/type-store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's document types, in order. */
export async function GET(_request: Request, { params }: Params) {
  const context = await circleContext({ circleId: params.id });
  if ("error" in context) return context.error;
  return NextResponse.json({ types: typesFor(params.id, await readTypeMap()) });
}

const schema = z.object({
  types: z
    .array(z.object({ id: z.string().max(40).nullable().optional(), label: z.string().max(60) }))
    .max(40),
});

/** Replace a circle's document types: its members, the Board, or an admin. */
export async function PUT(request: NextRequest, { params }: Params) {
  const context = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in context) return context.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("List the document types to keep");
  const saved = await saveCircleTypes(params.id, parsed.data.types);
  if (typeof saved === "string") return problem(saved);
  return NextResponse.json({ types: saved });
}
