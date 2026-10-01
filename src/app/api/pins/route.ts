import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { canUploadTo } from "@/lib/documents/access";
import { problem } from "@/lib/http";
import { isAdmin } from "@/lib/auth/admins";
import type { DirectoryDocument } from "@/lib/directory/types";
import { MAX_PINS_PER_TARGET, addPin, listPins, noteRefSchema, pinInputSchema, targetSchema } from "@/lib/pins/store";
import { canPinTo, canSeePin, pinViews, resolveTarget } from "@/lib/pins/server";
import { parseTargetKey } from "@/lib/pins/shared";
import { createPage, pageInputSchema, readPages } from "@/lib/wiki/store";
import { wikiProblem } from "@/lib/wiki/http";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** The wikis you can write a new note in, with `preferred` first when you can. */
function noteCircles(user: { personId?: string | null }, directory: DirectoryDocument, preferred: string | null) {
  const mine = directory.circles.filter(
    (circle) => featureEnabled(circle, "wiki") && circle.id !== "community" && circle.seats.some((seat) => seat.personId === user.personId) && canUploadTo(user, directory, circle.id)
  );
  const preferredCircle = directory.circles.find((circle) => circle.id === preferred && featureEnabled(circle, "wiki") && canUploadTo(user, directory, circle.id));
  const rest = directory.circles.filter((circle) => featureEnabled(circle, "wiki") && canUploadTo(user, directory, circle.id) && !mine.includes(circle));
  const list = [...(preferredCircle ? [preferredCircle] : []), ...mine, ...rest];
  return list.filter((circle, index) => list.indexOf(circle) === index).map((circle) => ({ id: circle.id, name: circle.name }));
}

/**
 * `?target=kind:id`: the notes pinned there, and whether you can pin more.
 * `?note=circleId:pageId`: everywhere a note is pinned (that you can see).
 * `?kind=document`: every note pinned to a document (for the documents list).
 */
export async function GET(request: NextRequest) {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const params = request.nextUrl.searchParams;

  const note = params.get("note");
  if (note) {
    const [circleId, pageId] = note.split(":");
    const parsed = noteRefSchema.safeParse({ circleId, pageId });
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
  // A person's pins are for them.
  if (target.kind === "person" && target.id !== ctx.personId && !isAdmin(ctx.user)) {
    return NextResponse.json({ pins: [], canPin: false, noteCircles: [] }, { headers: noStore });
  }
  const resolved = await resolveTarget(ctx.directory, target);
  if (!resolved) return problem("That no longer exists", 404, "Not Found");
  const pins = await listPins(ctx.directory.circles, { target });
  const canPin = canPinTo(ctx.user, ctx.directory, resolved);
  return NextResponse.json(
    {
      pins: await pinViews(ctx.user, ctx.directory, pins, [resolved]),
      canPin,
      label: resolved.label,
      noteCircles: canPin ? noteCircles(ctx.user, ctx.directory, resolved.circleId) : [],
    },
    { headers: noStore }
  );
}

const newNoteSchema = z.object({
  newNote: pageInputSchema.extend({ circleId: z.string().min(1).max(80) }),
  target: targetSchema,
  until: pinInputSchema.shape.until,
  reason: pinInputSchema.shape.reason,
});

/**
 * Pin a note: `{note, target, until?, reason?}`. Or write a new one and pin
 * it in one go: `{newNote: {circleId, title, body, color}, target, …}`.
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
  if (!canPinTo(ctx.user, ctx.directory, resolved)) return problem(`You can't pin notes to ${resolved.label}`, 403, "Forbidden");

  let note: { circleId: string; pageId: string };
  if ("newNote" in parsed.data) {
    const { circleId, ...input } = parsed.data.newNote;
    const circle = ctx.directory.circles.find((entry) => entry.id === circleId);
    if (!circle) return problem("Circle not found", 404, "Not Found");
    if (!featureEnabled(circle, "wiki")) return problem(`${circle.name} has turned its wiki off`, 409, "Conflict");
    if (!canUploadTo(ctx.user, ctx.directory, circleId)) return problem(`Only ${circle.name}'s members, the Board, and admins can write in its wiki`, 403, "Forbidden");
    if ((await listPins(ctx.directory.circles, { target })).length >= MAX_PINS_PER_TARGET) return problem(`${resolved.label} has ${MAX_PINS_PER_TARGET} notes pinned; unpin one first`, 409, "Conflict");
    const created = await createPage(circleId, { userId: ctx.user.id, name: ctx.user.name }, input);
    if (!created.ok) return wikiProblem(created.reason);
    note = { circleId, pageId: created.page!.id };
  } else {
    note = parsed.data.note;
    if (!(await readPages(note.circleId)).some((page) => page.id === note.pageId)) return problem("That note no longer exists", 404, "Not Found");
  }

  const result = await addPin(ctx.directory.circles, { note, target, until, reason }, by);
  if (!result.ok) {
    return result.reason === "exists"
      ? problem(`It's already pinned to ${resolved.label}`, 409, "Conflict")
      : problem(`${resolved.label} has ${MAX_PINS_PER_TARGET} notes pinned; unpin one first`, 409, "Conflict");
  }
  const [view] = await pinViews(ctx.user, ctx.directory, [result.pin].filter((pin) => canSeePin(ctx.user, pin)), [resolved]);
  return NextResponse.json({ pin: view ?? null }, { status: 201 });
}
