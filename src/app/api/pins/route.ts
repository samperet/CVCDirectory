import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { canUploadTo } from "@/lib/documents/access";
import { problem } from "@/lib/http";
import { isAdmin } from "@/lib/auth/admins";
import { addPin, maxPinsOn, listPins, noteRefSchema, pinInputSchema, targetSchema } from "@/lib/pins/store";
import { canPinTo, pinViews, resolveTarget } from "@/lib/pins/server";
import { parseTargetKey } from "@/lib/pins/shared";
import { createPage, getPageById, pageInputSchema } from "@/lib/wiki/store";
import { canViewPage } from "@/lib/wiki/access";
import { wikiProblem } from "@/lib/wiki/http";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * `?target=kind:id`: the pages pinned there (newest first), whether you can
 * pin more — and, on a circle, whether you can add information to it.
 * Add `&full=1` for each page's whole text.
 * `?note=pageId`: everywhere a page is pinned (that you can see).
 * `?kind=document`: every page pinned to a document (for the documents list).
 */
export async function GET(request: NextRequest) {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const params = request.nextUrl.searchParams;

  const note = params.get("note");
  if (note) {
    // (Older links name the page as `circleId:pageId`.)
    const parsed = noteRefSchema.safeParse({ pageId: note.slice(note.lastIndexOf(":") + 1) });
    if (!parsed.success) return problem("That isn't a note");
    const pins = await listPins(ctx.directory.circles, { note: parsed.data });
    return NextResponse.json({ pins: await pinViews(ctx.user, ctx.directory, pins) }, { headers: noStore });
  }

  if (params.get("kind") === "document") {
    const pins = await listPins(ctx.directory.circles, { kind: "document" });
    return NextResponse.json({ pins: await pinViews(ctx.user, ctx.directory, pins) }, { headers: noStore });
  }

  const target = parseTargetKey(params.get("target"));
  if (!target) return problem("Say where to look: ?target=kind:id");
  const resolved = await resolveTarget(ctx.directory, target);
  if (!resolved) return problem("That no longer exists", 404, "Not Found");
  const pins = await listPins(ctx.directory.circles, { target });
  const circle = target.kind === "circle" ? ctx.directory.circles.find((entry) => entry.id === target.id) : undefined;
  return NextResponse.json(
    {
      pins: await pinViews(ctx.user, ctx.directory, pins, [resolved], { full: params.get("full") === "1" }),
      canPin: canPinTo(ctx.user, ctx.directory, resolved),
      label: resolved.label,
      // Information starts on a circle: a new page in its wiki, shown on its page.
      canAdd: !!circle && featureEnabled(circle, "wiki") && canUploadTo(ctx.user, ctx.directory, circle.id),
    },
    { headers: noStore }
  );
}

const newNoteSchema = z.object({
  newNote: pageInputSchema.omit({ from: true, keeper: true }).extend({ circleId: z.string().min(1).max(80) }),
  target: targetSchema,
  until: pinInputSchema.shape.until,
  reason: pinInputSchema.shape.reason,
});

/**
 * Pin a page: `{note, target, until?, reason?}`. Or add information to a
 * circle — a new page kept by it, shown on its page — in one go:
 * `{newNote: {circleId, title, body, color}, target: {kind: "circle", id: circleId}}`.
 */
export async function POST(request: NextRequest) {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => null);
  const isNew = !!body && typeof body === "object" && "newNote" in body;
  const parsed = isNew ? newNoteSchema.safeParse(body) : pinInputSchema.safeParse(body);
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const { target, until, reason } = parsed.data;
  const by = { personId: ctx.personId, name: ctx.user.name };

  const resolved = await resolveTarget(ctx.directory, target);
  if (!resolved) return problem("That no longer exists", 404, "Not Found");
  if (!canPinTo(ctx.user, ctx.directory, resolved)) return problem(`You can't pin pages to ${resolved.label}`, 403, "Forbidden");
  const full = problem(`${resolved.label} has ${maxPinsOn(target)} pages pinned; take one off first`, 409, "Conflict");

  let note: { pageId: string };
  if ("newNote" in parsed.data) {
    const { circleId, ...input } = parsed.data.newNote;
    if (target.kind !== "circle" || target.id !== circleId) return problem("New information starts on a circle, in that circle's wiki");
    const circle = ctx.directory.circles.find((entry) => entry.id === circleId);
    if (!circle) return problem("Circle not found", 404, "Not Found");
    if (!featureEnabled(circle, "wiki")) return problem(`${circle.name} has turned its Information off`, 409, "Conflict");
    if (!canUploadTo(ctx.user, ctx.directory, circleId)) return problem(`Only ${circle.name}'s members, the Board, and admins can write in its wiki`, 403, "Forbidden");
    if ((await listPins(ctx.directory.circles, { target })).length >= maxPinsOn(target)) return full;
    // The circle keeps the new page.
    const created = await createPage({ userId: ctx.user.id, name: ctx.user.name }, { ...input, keeper: circleId });
    if (!created.ok) return wikiProblem(created.reason);
    note = { pageId: created.page!.id };
  } else {
    note = { pageId: parsed.data.note.pageId };
    const page = await getPageById(note.pageId);
    if (!page || !canViewPage(ctx.user, ctx.directory, page)) return problem("That page no longer exists", 404, "Not Found");
  }

  const result = await addPin(ctx.directory.circles, { note, target, until, reason }, by);
  if (!result.ok) {
    return result.reason === "exists"
      ? problem(`It's already pinned to ${resolved.label}`, 409, "Conflict")
      : full;
  }
  const [view] = await pinViews(ctx.user, ctx.directory, [result.pin], [resolved]);
  return NextResponse.json({ pin: view ?? null }, { status: 201 });
}
