import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/actor";
import { removeSkill } from "@/lib/skills/store";
import { forbidden, notFound, problem } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to remove a skill", 401);

  const result = await removeSkill(actorOf(user), params.id);
  if (result === "not_found") return notFound("Skill");
  if (result === "forbidden") return forbidden("You can only remove your own skills");
  return NextResponse.json({ ok: true });
}
