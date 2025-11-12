import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { memberUpdateSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const member = await prisma.member.findUnique({
    where: { id: params.id },
    include: {
      circles: { include: { circle: true } },
      skills: { include: { skill: true } },
      loanItems: true,
    },
  });

  if (!member) {
    return problem("Member not found", 404, "Not Found");
  }

  return NextResponse.json(member);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const json = await request.json();
  const parsed = memberUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  try {
    const member = await prisma.member.update({
      where: { id: params.id },
      data: {
        ...parsed.data,
        ...(parsed.data.dateJoined ? { dateJoined: new Date(parsed.data.dateJoined) } : {}),
      },
    });
    return NextResponse.json(member);
  } catch (error) {
    return problem("Unable to update member", 400);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  try {
    await prisma.member.delete({ where: { id: params.id } });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return problem("Unable to delete member", 400);
  }
}
