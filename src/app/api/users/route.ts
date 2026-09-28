import { NextResponse } from "next/server";
import { listUsers } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

/** Accounts with their verified status, for badging authors. Accounts are created by signing in. */
export async function GET() {
  return NextResponse.json({ users: await listUsers() });
}
