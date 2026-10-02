import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { readDirectory } from "@/lib/directory/store";
import { mutateJson, readJson } from "@/lib/storage";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY — remove after use. The Meetings module is gone; its test
 * minutes are to be deleted, its proposals kept in storage (unshown).
 * Requires `Authorization: Bearer <ADMIN_TOKEN>`. GET returns every circle's
 * `meetings/<circleId>.json` as stored (the backup to take first); POST
 * `{ "confirm": "delete-minutes" }` empties each file's `meetings`, leaving
 * `proposals` as they are.
 */

const key = (circleId: string) => `meetings/${circleId}.json`;

async function circleIds() {
  return ((await readDirectory())?.circles ?? []).map((circle) => circle.id);
}

export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const files: Record<string, unknown> = {};
  for (const id of await circleIds()) {
    const stored = await readJson(key(id));
    if (stored) files[id] = stored;
  }
  return NextResponse.json({ files }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "delete-minutes") return problem('Send { "confirm": "delete-minutes" }');
  const removed: Record<string, number> = {};
  for (const id of await circleIds()) {
    removed[id] = await mutateJson<number>(key(id), (raw) => {
      const stored = raw as { meetings?: unknown[]; proposals?: unknown[] } | null;
      const count = Array.isArray(stored?.meetings) ? stored!.meetings.length : 0;
      if (!stored || !count) return { write: false, result: 0 };
      return { value: { ...stored, meetings: [] }, result: count };
    });
  }
  return NextResponse.json({ removed });
}
