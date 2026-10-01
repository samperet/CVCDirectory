import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { readDirectory } from "@/lib/directory/store";
import { legacyThreadPolls, removeThreadPolls } from "@/lib/forum/store";
import { deleteJson, readJson } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * A one-off clean-up of the polls from before polls moved into wiki pages:
 * circles' Polls sections (`community/polls.json`, `circle-polls/<id>.json`)
 * and forum discussions' polls. Requires `Authorization: Bearer
 * <ADMIN_TOKEN>`. GET returns them all (a backup); DELETE removes them.
 * Wiki polls (`wiki-polls/…`) are never touched.
 */
async function legacyCirclePolls() {
  const directory = await readDirectory();
  const keys = Array.from(new Set(["community/polls.json", ...(directory?.circles ?? []).map((circle) => (circle.id === "community" ? "community/polls.json" : `circle-polls/${circle.id}.json`))]));
  const found: { key: string; polls: unknown[] }[] = [];
  for (const key of keys) {
    const polls = ((await readJson(key)) as { polls?: unknown } | null)?.polls;
    if (Array.isArray(polls)) found.push({ key, polls });
  }
  return found;
}

export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const [circles, forum] = await Promise.all([legacyCirclePolls(), legacyThreadPolls()]);
  return NextResponse.json({ circles, forum, counts: { circlePolls: circles.reduce((sum, entry) => sum + entry.polls.length, 0), forumPolls: forum.length } });
}

export async function DELETE(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const circles = await legacyCirclePolls();
  for (const { key } of circles) await deleteJson(key);
  const forumPolls = await removeThreadPolls();
  return NextResponse.json({ deleted: { circlePolls: circles.reduce((sum, entry) => sum + entry.polls.length, 0), circleFiles: circles.length, forumPolls } });
}
