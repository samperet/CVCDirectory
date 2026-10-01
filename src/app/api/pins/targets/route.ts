import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { BOARD_ID, COMMUNITY_ID } from "@/lib/circles/store";
import { canManageCircle } from "@/lib/circles/icons";
import { canManageDocument, canUploadTo } from "@/lib/documents/access";
import { listDocuments } from "@/lib/documents/store";
import { isAdmin } from "@/lib/auth/admins";
import type { PinTargetOption } from "@/lib/pins/shared";

export const dynamic = "force-dynamic";

const PER_KIND = 8;

/**
 * Places you can pin a note to, matching `?q=` (every word, in the name):
 * the community dashboard, circles, and documents — only those you're
 * allowed to pin to.
 */
export async function GET(request: NextRequest) {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const { user, personId: me, directory } = ctx;
  const admin = isAdmin(user);
  const words = (request.nextUrl.searchParams.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (...texts: (string | null | undefined)[]) => {
    const text = texts.filter(Boolean).join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  };
  const take = <T,>(list: T[]) => list.slice(0, words.length ? PER_KIND : 4);
  const circleName = (id: string) => directory.circles.find((circle) => circle.id === id)?.name ?? "";

  const options: PinTargetOption[] = [];
  if ((admin || canManageCircle(directory, BOARD_ID, me)) && matches("Community dashboard everyone")) {
    options.push({ kind: "community", id: COMMUNITY_ID, label: "Community dashboard", meta: "Everyone's dashboard" });
  }

  const circles = directory.circles.filter((circle) => canUploadTo(user, directory, circle.id) && matches(circle.name));
  // Your own circles first.
  circles.sort((a, b) => Number(b.seats.some((seat) => seat.personId === me)) - Number(a.seats.some((seat) => seat.personId === me)) || a.name.localeCompare(b.name));
  options.push(...take(circles).map((circle) => ({ kind: "circle" as const, id: circle.id, label: circle.name, meta: circle.kind === "club" ? "Social club" : "Circle" })));

  if (words.length) {
    const docs = (await listDocuments()).filter((doc) => canManageDocument(user, directory, doc) && matches(doc.title));
    docs.sort((a, b) => (b.meetingDate ?? b.createdAt).localeCompare(a.meetingDate ?? a.createdAt));
    options.push(...take(docs).map((doc) => ({ kind: "document" as const, id: doc.id, label: doc.title, meta: `${circleName(doc.circleId)} document` })));
  }

  return NextResponse.json({ options }, { headers: { "Cache-Control": "private, no-store" } });
}
