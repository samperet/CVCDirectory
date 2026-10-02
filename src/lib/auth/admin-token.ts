import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { problem } from "@/lib/http";

/**
 * Bearer-token check for the admin API routes (directory import, photo
 * seeding). Requires `Authorization: Bearer <ADMIN_TOKEN>` and fails closed
 * when ADMIN_TOKEN is unset. Returns an error response, or null if allowed.
 */
export function authorizeAdminToken(request: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return problem("Admin API is disabled: ADMIN_TOKEN is not configured", 503);
  }
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Compare digests so the comparison is constant-time regardless of length.
  const a = new Uint8Array(createHash("sha256").update(supplied).digest());
  const b = new Uint8Array(createHash("sha256").update(expected).digest());
  if (!supplied || !timingSafeEqual(a, b)) {
    return problem("Invalid or missing admin token", 401);
  }
  return null;
}
