import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addAdmin, listAdmins } from "@/lib/auth/admin-store";
import { adminContext, adminProblem, adminViews } from "@/lib/auth/admin-http";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Who the admins are, and how each is one (built in, set in Vercel, or added here). Admins only. */
export async function GET() {
  const ctx = await adminContext();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    { admins: adminViews(await listAdmins(), ctx.directory, ctx.user.personId) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const addSchema = z.object({ personId: z.string().min(1).max(40) });

/** Make a resident an admin (`personId`). Admins only. */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "admins");
  if (limited) return limited;
  const ctx = await adminContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, addSchema);
  if ("error" in parsed) return parsed.error;
  const { personId } = parsed.data;
  if (!ctx.directory.people.some((person) => person.id === personId))
    return problem("That resident isn't in the directory", 404);
  const result = await addAdmin(personId, ctx.actor);
  if (!result.ok) return adminProblem(result.reason);
  return NextResponse.json(
    { admins: adminViews(result.admins, ctx.directory, ctx.user.personId) },
    { status: 201 }
  );
}
