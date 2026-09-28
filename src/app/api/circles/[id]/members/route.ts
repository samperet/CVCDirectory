import { NextRequest, NextResponse } from "next/server";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { addMember, memberInputSchema } from "@/lib/circles/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Add a resident to a circle (its members or the Board). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;

  const parsed = memberInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));

  const person = ctx.directory.people.find((entry) => entry.id === parsed.data.personId);
  if (!person) return problem("That resident isn't in the directory", 404, "Not Found");

  const result = await addMember(ctx.imported, params.id, { ...parsed.data, name: person.displayName });
  return result.ok ? NextResponse.json({ circle: result.value }, { status: 201 }) : circleProblem(result.reason);
}
