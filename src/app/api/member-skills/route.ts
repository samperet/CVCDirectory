import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { memberSkillSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const json = await request.json();
  const parsed = memberSkillSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  try {
    const record = await prisma.memberSkill.create({ data: parsed.data });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return problem("Unable to link skill", 400);
  }
}

export async function DELETE(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const json = await request.json();
  const parsed = memberSkillSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  try {
    await prisma.memberSkill.delete({ where: { memberId_skillId: parsed.data } });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return problem("Unable to remove skill", 400);
  }
}
