import { NextResponse } from "next/server";
import { wikiSession } from "@/lib/wiki/http";
import { deleteForever } from "@/lib/wiki/trash";
import { notFound, problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Delete a page in the trash for good, with its history, comments and versions (admins). */
export async function DELETE(_request: Request, { params }: { params: { pageId: string } }) {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  if (!ctx.actor.admin) return problem("Only admins can delete pages for good", 403);
  const result = await deleteForever(params.pageId);
  if (!result.ok) return notFound("Page in the trash");
  return NextResponse.json({ ok: true });
}
