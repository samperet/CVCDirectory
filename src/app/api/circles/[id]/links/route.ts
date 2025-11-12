import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { circleLinksSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { validateLinkMembers } from "@/lib/circles";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const json = await request.json();
  const parsed = circleLinksSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const valid = await validateLinkMembers({
    circleId: params.id,
    primaryLinkMemberId: parsed.data.primaryLinkMemberId,
    delegateLinkMemberId: parsed.data.delegateLinkMemberId,
  });

  if (!valid) {
    return problem("Invalid link member assignments");
  }

  try {
    const circle = await prisma.circle.update({
      where: { id: params.id },
      data: {
        primaryLinkMemberId: parsed.data.primaryLinkMemberId ?? null,
        delegateLinkMemberId: parsed.data.delegateLinkMemberId ?? null,
      },
      include: {
        primaryLinkMember: true,
        delegateLinkMember: true,
      },
    });

    return NextResponse.json(circle);
  } catch (error) {
    return problem("Unable to update links", 400);
  }
}
