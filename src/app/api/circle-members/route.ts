import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { circleMemberSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const json = await request.json();
  const parsed = circleMemberSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const { circleId, memberId, role } = parsed.data;

  try {
    const record = await prisma.circleMember.upsert({
      where: { circleId_memberId: { circleId, memberId } },
      update: { role: role ?? null },
      create: { circleId, memberId, role: role ?? null },
    });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return problem("Unable to update circle membership", 400);
  }
}

export async function DELETE(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const json = await request.json();
  const parsed = circleMemberSchema.omit({ role: true }).safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const { circleId, memberId } = parsed.data;

  try {
    await prisma.circleMember.delete({ where: { circleId_memberId: { circleId, memberId } } });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return problem("Unable to remove circle member", 400);
  }
}
