import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { readDirectory } from "@/lib/directory/store";
import { readJson } from "@/lib/storage";
import { readPages } from "@/lib/wiki/store";
import { embedsIn } from "@/lib/wiki/sections";
import { WIKI_LINK } from "@/lib/wiki/links";

export const dynamic = "force-dynamic";

/**
 * A one-off check of bringing the circles' wikis together, behind
 * `Authorization: Bearer <ADMIN_TOKEN>`. `?raw=1` returns the old documents
 * as they are (a backup, read without changing anything); otherwise the
 * merged wiki (bringing it together first, if that hasn't happened) with any
 * links or embeds that don't find a page. To be removed once done.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const circles = (await readDirectory())?.circles ?? [];
  if (request.nextUrl.searchParams.get("raw")) {
    const wikis: Record<string, unknown> = {};
    for (const circle of circles) wikis[circle.id] = await readJson(`wiki/${circle.id}.json`);
    return NextResponse.json({ pins: await readJson("pins.json"), wikis, merged: !!(await readJson("wiki/pages.json")) });
  }
  const pages = await readPages();
  const titles = new Set(pages.map((page) => page.title.toLowerCase()));
  const strip = (target: string) => target.slice(target.indexOf(":") + 1).trim().toLowerCase();
  const missing: string[] = [];
  for (const page of pages) {
    for (const match of Array.from(page.body.matchAll(WIKI_LINK))) {
      if (/^\s*doc\s*:/i.test(match[1])) continue;
      if (!titles.has(match[1].trim().toLowerCase()) && !titles.has(strip(match[1]))) missing.push(`${page.title} → [[${match[1]}]]`);
    }
    for (const embed of embedsIn(page.body)) if (!titles.has(embed.page.toLowerCase())) missing.push(`${page.title} → embed ${embed.page}`);
  }
  const pins = (await readJson("pins.json")) as { version?: number; pins?: unknown[] } | null;
  const polls = (await readJson("wiki/polls.json")) as { polls?: unknown[] } | null;
  return NextResponse.json({
    count: pages.length,
    pages: pages.map((page) => ({ title: page.title, slug: page.slug, keeper: page.keeper, parent: page.parentId ?? null, aliases: page.aliases ?? [], historyCount: page.historyCount })),
    missing,
    pins: { version: pins?.version, count: pins?.pins?.length },
    polls: polls?.polls?.length ?? 0,
  });
}
