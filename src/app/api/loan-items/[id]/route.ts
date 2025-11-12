import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loanItemUpdateSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const item = await prisma.loanItem.findUnique({
    where: { id: params.id },
    include: { owner: true },
  });

  if (!item) {
    return problem("Loan item not found", 404, "Not Found");
  }

  return NextResponse.json(item);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const json = await request.json();
  const parsed = loanItemUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  try {
    const item = await prisma.loanItem.update({
      where: { id: params.id },
      data: parsed.data,
      include: { owner: true },
    });
    return NextResponse.json(item);
  } catch (error) {
    return problem("Unable to update loan item", 400);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  try {
    await prisma.loanItem.delete({ where: { id: params.id } });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return problem("Unable to delete loan item", 400);
  }
}
