import { NextResponse } from "next/server";
import { sessionPayload } from "@/lib/auth/me";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await sessionPayload());
}
