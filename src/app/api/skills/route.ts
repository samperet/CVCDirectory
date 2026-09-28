import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import { addSkill, listSkills, skillInputSchema } from "@/lib/skills/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Every skill with the resident who offers it (current directory name and unit). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view skills", 401, "Unauthorized");

  const [skills, directory] = await Promise.all([listSkills(), readDirectory()]);
  const people = new Map((directory?.people ?? []).map((person) => [person.id, person]));
  return NextResponse.json({
    skills: skills.map((skill) => {
      const person = people.get(skill.personId);
      return {
        id: skill.id,
        name: skill.name,
        category: skill.category,
        personId: skill.personId,
        personName: person?.displayName ?? skill.personName,
        unit: person?.unit ?? null,
        mine: skill.personId === user.personId,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`skills:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to add a skill", 401, "Unauthorized");

  const parsed = skillInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));

  const result = await addSkill({ id: user.personId, name: user.name }, parsed.data);
  if (!result.ok) {
    return result.reason === "duplicate"
      ? problem("You've already listed that skill", 409, "Conflict")
      : problem("You can list up to 30 skills", 409, "Conflict");
  }
  return NextResponse.json({ skill: result.skill }, { status: 201 });
}
