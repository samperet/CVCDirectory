import { NextRequest, NextResponse } from "next/server";
import { userIdsForPeople } from "@/lib/auth/users";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { joinInputSchema, leaveCircle, requestToJoin } from "@/lib/circles/store";
import { excerpt, notify } from "@/lib/push/notify";
import { readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * Join a circle: straight away if anyone can join, otherwise as an
 * application its members approve (with an optional note to them).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, joinInputSchema, {});
  if ("error" in parsed) return parsed.error;

  const person = ctx.directory.people.find((entry) => entry.id === ctx.personId);
  const name = person?.displayName ?? ctx.user.name;
  const result = await requestToJoin(ctx.imported, params.id, { personId: ctx.personId, name }, parsed.data.message);
  if (!result.ok) return circleProblem(result.reason);

  const { circle, joined } = result.value;
  if (!joined) {
    await notify({
      topic: "circles",
      title: `${name} asked to join ${circle.name}`,
      body: parsed.data.message ? excerpt(parsed.data.message) : "Approve or decline on the circle's page.",
      url: `/circles/${circle.id}`,
      tag: `circle-application-${circle.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: await userIdsForPeople(circle.seats.map((seat) => seat.personId)),
    });
  }
  return NextResponse.json({ joined }, { status: 201 });
}

/** Leave a circle, or withdraw an application to it. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id });
  if ("error" in ctx) return ctx.error;
  const result = await leaveCircle(ctx.imported, params.id, ctx.personId);
  return result.ok ? NextResponse.json(result.value) : circleProblem(result.reason);
}
