import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPagination } from "@/lib/pagination";
import { parseSort } from "@/lib/sort";
import { circleInputSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ensureNoCycle } from "@/lib/circles";

function buildWhere(q: string): Prisma.CircleWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const { q, sort, page, pageSize } = getPagination(request);
  const where = buildWhere(q);
  const parsedSort = parseSort(sort, ["name"]);
  const orderBy = (
    parsedSort ? { [parsedSort.field]: parsedSort.direction } : { name: "asc" }
  ) as Prisma.CircleOrderByWithRelationInput;

  const [total, data] = await Promise.all([
    prisma.circle.count({ where }),
    prisma.circle.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        parent: true,
        children: true,
        members: { include: { member: true } },
      },
    }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const json = await request.json();
  const parsed = circleInputSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const validHierarchy = await ensureNoCycle(parsed.data.parentId ?? null);
  if (!validHierarchy) {
    return problem("Circular hierarchy detected");
  }

  try {
    const circle = await prisma.circle.create({ data: parsed.data });
    return NextResponse.json(circle, { status: 201 });
  } catch (error) {
    return problem("Unable to create circle", 400);
  }
}
