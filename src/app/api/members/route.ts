import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPagination } from "@/lib/pagination";
import { parseSort } from "@/lib/sort";
import { memberInputSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

function buildWhere(q: string) {
  if (!q) return {};
  return {
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { lotNumber: { contains: q, mode: "insensitive" } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const { q, sort, page, pageSize } = getPagination(request);
  const where = buildWhere(q);
  const parsedSort = parseSort(sort, ["firstName", "lastName", "lotNumber", "dateJoined"]);
  const orderBy = parsedSort ? { [parsedSort.field]: parsedSort.direction } : { lastName: "asc" };

  const [total, data] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const json = await request.json();
  const parsed = memberInputSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  try {
    const member = await prisma.member.create({
      data: {
        ...parsed.data,
        dateJoined: new Date(parsed.data.dateJoined),
      },
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return problem("Unable to create member", 400);
  }
}
