import { NextRequest, NextResponse } from "next/server";
import { removeAdmin } from "@/lib/auth/admin-store";
import { adminContext, adminProblem, adminViews } from "@/lib/auth/admin-http";
import { throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Stop a resident being an admin: one added here (not built in or set in Vercel), never the last. */
export async function DELETE(request: NextRequest, { params }: { params: { personId: string } }) {
  const limited = throttled(request, "admins");
  if (limited) return limited;
  const ctx = await adminContext();
  if ("error" in ctx) return ctx.error;
  const result = await removeAdmin(params.personId);
  if (!result.ok) return adminProblem(result.reason);
  return NextResponse.json({
    admins: adminViews(result.admins, ctx.directory, ctx.user.personId),
  });
}
