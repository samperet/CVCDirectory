import { NextResponse } from "next/server";
import { getThread } from "@/lib/forum/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const doc = await getThread(params.id);
  if (!doc) {
    return problem("Discussion not found", 404, "Not Found");
  }
  return NextResponse.json(doc);
}
