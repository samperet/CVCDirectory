import { NextResponse } from "next/server";
import { isDurable, isPersistent, readJson } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Storage health. Performs a real read first — durability only reflects a
 * failure once an R2 operation has been attempted — then reports booleans
 * only, never configuration values.
 */
export async function GET() {
  await readJson("health/probe.json");
  const configured = isPersistent();
  const durable = isDurable();
  return NextResponse.json({ storage: { configured, durable } }, { status: durable ? 200 : 503 });
}
