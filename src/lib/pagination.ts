import { NextRequest } from "next/server";
import { paginationQuerySchema } from "@/lib/validation";

export function getPagination(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = paginationQuerySchema.safeParse(query);
  if (!parsed.success) {
    return { q: "", sort: "", page: 1, pageSize: 20 };
  }
  const { q = "", sort = "", page = "1", pageSize = "20" } = parsed.data;
  return {
    q,
    sort,
    page: Number.parseInt(page, 10) || 1,
    pageSize: Math.min(Number.parseInt(pageSize, 10) || 20, 100),
  };
}
