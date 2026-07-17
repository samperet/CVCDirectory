import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPagination } from "@/lib/pagination";
import { parseSort } from "@/lib/sort";
import { skillInputSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

function buildWhere(q: string): Prisma.SkillWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const { q, sort, page, pageSize } = getPagination(request);
  const where = buildWhere(q);
  const parsedSort = parseSort(sort, ["name"]);
  const orderBy = (
    parsedSort ? { [parsedSort.field]: parsedSort.direction } : { name: "asc" }
  ) as Prisma.SkillOrderByWithRelationInput;

  const [total, data] = await Promise.all([
    prisma.skill.count({ where }),
    prisma.skill.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        members: {
          include: { member: true },
        },
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
  const parsed = skillInputSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  try {
    const skill = await prisma.skill.create({ data: parsed.data });
    return NextResponse.json(skill, { status: 201 });
  } catch (error) {
    return problem("Unable to create skill", 400);
  }
}
