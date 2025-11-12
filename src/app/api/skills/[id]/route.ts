import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { skillInputSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const skill = await prisma.skill.findUnique({
    where: { id: params.id },
    include: { members: { include: { member: true } } },
  });

  if (!skill) {
    return problem("Skill not found", 404, "Not Found");
  }

  return NextResponse.json(skill);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const json = await request.json();
  const parsed = skillInputSchema.partial().safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  try {
    const skill = await prisma.skill.update({ where: { id: params.id }, data: parsed.data });
    return NextResponse.json(skill);
  } catch (error) {
    return problem("Unable to update skill", 400);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  try {
    await prisma.skill.delete({ where: { id: params.id } });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return problem("Unable to delete skill", 400);
  }
}
