import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { clearColours, readPages } from "@/lib/wiki/store";

export const dynamic = "force-dynamic";

/**
 * A one-off: every wiki page back to white, behind `Authorization: Bearer
 * <ADMIN_TOKEN>`. GET lists each page's colour (a backup); POST clears them.
 * To be removed once done.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  return NextResponse.json({ pages: (await readPages()).map((page) => ({ slug: page.slug, title: page.title, color: page.color ?? null })) });
}

export async function POST(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const result = await clearColours();
  if (!result.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, pages: (await readPages()).map((page) => ({ slug: page.slug, color: page.color ?? null })) });
}
