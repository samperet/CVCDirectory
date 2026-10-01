import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { problem } from "@/lib/http";
import { readPages, updatePage } from "@/lib/wiki/store";

export const dynamic = "force-dynamic";

/**
 * A one-off for rebuilding the Living in Community Guide with embedded
 * pages, behind `Authorization: Bearer <ADMIN_TOKEN>`. GET `?circles=a,b`
 * returns those wikis' pages in full (a backup before writing). PATCH saves
 * new text for pages, each only if it hasn't changed since it was read
 * (`baseUpdatedAt`) — as a new version, so History can undo it. To be
 * removed once the rebuild is done.
 */

const editSchema = z.object({
  author: z.string().trim().min(1).max(80),
  edits: z
    .array(z.object({ circleId: z.string().min(1).max(80), slug: z.string().min(1).max(60), body: z.string().max(50_000), baseUpdatedAt: z.string().min(1) }))
    .max(60),
});

export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const ids = (request.nextUrl.searchParams.get("circles") ?? "").split(",").filter(Boolean).slice(0, 20);
  const circles = await Promise.all(
    ids.map(async (id) => ({
      id,
      pages: (await readPages(id)).map(({ id: pageId, slug, title, body, updatedAt, parentId }) => ({ id: pageId, slug, title, body, updatedAt, parentId: parentId ?? null })),
    }))
  );
  return NextResponse.json({ circles });
}

export async function PATCH(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join(", "));
  const results: { page: string; ok: boolean; reason?: string }[] = [];
  for (const edit of parsed.data.edits) {
    const result = await updatePage(edit.circleId, edit.slug, { userId: "wiki-guide", name: parsed.data.author }, { body: edit.body, baseUpdatedAt: edit.baseUpdatedAt });
    results.push({ page: `${edit.circleId}/${edit.slug}`, ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) });
  }
  return NextResponse.json({ results });
}
