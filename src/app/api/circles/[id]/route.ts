import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { circleUpdateSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ensureNoCycle } from "@/lib/circles";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const circle = await prisma.circle.findUnique({
    where: { id: params.id },
    include: {
      parent: { include: { members: { include: { member: true } }, primaryLinkMember: true, delegateLinkMember: true } },
      children: { include: { primaryLinkMember: true, delegateLinkMember: true } },
      members: { include: { member: true } },
      primaryLinkMember: true,
      delegateLinkMember: true,
    },
  });

  if (!circle) {
    return problem("Circle not found", 404, "Not Found");
  }

  return NextResponse.json(circle);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const json = await request.json();
  const parsed = circleUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const validHierarchy = await ensureNoCycle(parsed.data.parentId ?? null, params.id);
  if (!validHierarchy) {
    return problem("Circular hierarchy detected");
  }

  try {
    const circle = await prisma.circle.update({
      where: { id: params.id },
      data: parsed.data,
    });
    return NextResponse.json(circle);
  } catch (error) {
    return problem("Unable to update circle", 400);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  try {
    await prisma.circle.delete({ where: { id: params.id } });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return problem("Unable to delete circle", 400);
  }
}
