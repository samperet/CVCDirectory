import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { problem } from "@/lib/http";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const circle = await prisma.circle.findUnique({
    where: { id: params.id },
    include: {
      parent: {
        include: {
          parent: true,
          primaryLinkMember: true,
          delegateLinkMember: true,
        },
      },
      children: {
        include: {
          primaryLinkMember: true,
          delegateLinkMember: true,
        },
      },
      primaryLinkMember: true,
      delegateLinkMember: true,
    },
  });

  if (!circle) {
    return problem("Circle not found", 404, "Not Found");
  }

  return NextResponse.json(circle);
}
