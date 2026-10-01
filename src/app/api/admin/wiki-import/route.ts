import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";
import { addPin } from "@/lib/pins/store";
import { NOTE_COLORS } from "@/lib/pins/shared";
import { createPage, listPages, readPages } from "@/lib/wiki/store";

export const dynamic = "force-dynamic";

/**
 * A one-off import of wiki pages (the Living in Community Guide), behind
 * `Authorization: Bearer <ADMIN_TOKEN>`. GET lists every circle's page
 * titles (a backup before writing). POST takes pages in order — each in a
 * circle's wiki, optionally started from an earlier page (`parent`, by
 * title), listed on its circle, and pinned to the community dashboard —
 * and never overwrites: a title that's already there is skipped.
 */

const importSchema = z.object({
  author: z.object({ name: z.string().min(1).max(80), personId: z.string().max(40).nullable() }),
  pages: z
    .array(
      z.object({
        circleId: z.string().min(1).max(80),
        title: z.string().trim().min(1).max(120),
        body: z.string().max(50_000),
        color: z.enum(NOTE_COLORS).optional(),
        parent: z.string().max(120).optional(),
        listed: z.boolean().default(false),
        dashboard: z.boolean().default(false),
      })
    )
    .max(100),
});

export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const directory = await readDirectory();
  const circles = await Promise.all(
    (directory?.circles ?? []).map(async (circle) => ({ id: circle.id, pages: (await listPages(circle.id)).map((page) => ({ title: page.title, slug: page.slug })) }))
  );
  return NextResponse.json({ circles });
}

export async function POST(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const directory = await readDirectory();
  if (!directory) return problem("The directory hasn't been imported yet", 503, "Service Unavailable");
  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join(", "));
  const { author, pages } = parsed.data;
  const unknown = pages.filter((page) => !directory.circles.some((circle) => circle.id === page.circleId));
  if (unknown.length) return problem(`Unknown circles: ${Array.from(new Set(unknown.map((page) => page.circleId))).join(", ")}`, 404, "Not Found");

  const created: string[] = [];
  const skipped: string[] = [];
  const by = { personId: author.personId, name: author.name };
  for (const page of pages) {
    const existing = await readPages(page.circleId);
    if (existing.some((entry) => entry.title.toLowerCase() === page.title.toLowerCase())) {
      skipped.push(`${page.circleId}: ${page.title}`);
      continue;
    }
    const parentId = page.parent ? existing.find((entry) => entry.title.toLowerCase() === page.parent!.toLowerCase())?.id : undefined;
    const result = await createPage(page.circleId, { userId: "wiki-import", name: author.name }, { title: page.title, body: page.body, color: page.color, parentId });
    if (!result.ok || !result.page) {
      skipped.push(`${page.circleId}: ${page.title} (${result.ok ? "not made" : result.reason})`);
      continue;
    }
    const note = { circleId: page.circleId, pageId: result.page.id };
    if (page.listed) await addPin(directory.circles, { note, target: { kind: "circle", id: page.circleId }, until: null, reason: null }, by);
    if (page.dashboard) await addPin(directory.circles, { note, target: { kind: "community", id: "community" }, until: null, reason: null }, by);
    created.push(`${page.circleId}: ${page.title}`);
  }
  return NextResponse.json({ created, skipped });
}
