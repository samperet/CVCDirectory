import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminToken as authorize } from "@/lib/auth/admin-token";
import { BOARD_ID, COMMUNITY_ID, readCircles, updateCircle } from "@/lib/circles/store";
import { readImportedDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Admin upkeep of circles, behind `Authorization: Bearer <ADMIN_TOKEN>`.
 * GET lists circles (id, name, kind, member count — no names); POST
 * `{ kind: "circle" | "club", names: [...] }` sets the kind of the circles
 * with those names (not the Board or Community).
 */
async function circles() {
  const imported = await readImportedDirectory();
  return imported ? { imported: imported.circles, list: await readCircles(imported.circles) } : null;
}

export async function GET(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  const loaded = await circles();
  if (!loaded) return problem("The directory hasn't been imported yet", 503, "Service Unavailable");
  return NextResponse.json({
    circles: loaded.list.map((circle) => ({ id: circle.id, name: circle.name, kind: circle.kind ?? "circle", members: circle.seats.length })),
  });
}

const schema = z.object({ kind: z.enum(["circle", "club"]), names: z.array(z.string().trim().min(1)).min(1).max(50) });

export async function POST(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Give `kind` and `names`");
  const loaded = await circles();
  if (!loaded) return problem("The directory hasn't been imported yet", 503, "Service Unavailable");
  const results: string[] = [];
  for (const name of parsed.data.names) {
    const circle = loaded.list.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (!circle) {
      results.push(`${name}: not found`);
      continue;
    }
    if (circle.id === BOARD_ID || circle.id === COMMUNITY_ID) {
      results.push(`${circle.name}: can't change`);
      continue;
    }
    const result = await updateCircle(loaded.imported, circle.id, { kind: parsed.data.kind });
    results.push(`${circle.name}: ${result.ok ? parsed.data.kind : result.reason}`);
  }
  return NextResponse.json({ results });
}
