import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { removeSkill } from "@/lib/skills/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to remove a skill", 401, "Unauthorized");

  const result = await removeSkill(user.personId, params.id);
  if (result === "not_found") return problem("Skill not found", 404, "Not Found");
  if (result === "forbidden") return problem("You can only remove your own skills", 403, "Forbidden");
  return NextResponse.json({ ok: true });
}
