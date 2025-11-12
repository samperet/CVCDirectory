import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPagination } from "@/lib/pagination";
import { parseSort } from "@/lib/sort";
import { loanItemInputSchema } from "@/lib/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

function buildWhere(q: string, params: URLSearchParams) {
  const filters: any = {};
  if (q) {
    filters.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }
  const category = params.get("category");
  if (category) {
    filters.category = { equals: category };
  }
  const available = params.get("available");
  if (available === "true") {
    filters.available = true;
  }
  if (available === "false") {
    filters.available = false;
  }
  return filters;
}

export async function GET(request: NextRequest) {
  const { q, sort, page, pageSize } = getPagination(request);
  const where = buildWhere(q, request.nextUrl.searchParams);
  const parsedSort = parseSort(sort, ["title", "category"]);
  const orderBy = parsedSort ? { [parsedSort.field]: parsedSort.direction } : { title: "asc" };

  const [total, data] = await Promise.all([
    prisma.loanItem.count({ where }),
    prisma.loanItem.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { owner: true },
    }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const json = await request.json();
  const parsed = loanItemInputSchema.safeParse(json);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  try {
    const item = await prisma.loanItem.create({
      data: parsed.data,
      include: { owner: true },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return problem("Unable to create loan item", 400);
  }
}
