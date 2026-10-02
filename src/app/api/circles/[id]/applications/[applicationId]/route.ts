import { NextRequest, NextResponse } from "next/server";
import { userIdsForPeople } from "@/lib/auth/users";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { decideApplication, decisionSchema } from "@/lib/circles/store";
import { notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Approve or decline an application to join (the circle's members or the Board). */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; applicationId: string } }
) {
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Approve or decline the application");

  const result = await decideApplication(
    ctx.imported,
    params.id,
    params.applicationId,
    parsed.data.approve
  );
  if (!result.ok) return circleProblem(result.reason);
  const { circle, application } = result.value;
  await notify({
    topic: "circles",
    title: parsed.data.approve
      ? `Welcome to ${circle.name}`
      : `Your request to join ${circle.name}`,
    body: parsed.data.approve
      ? `${ctx.user.name} approved your request — you're now a member.`
      : `${ctx.user.name} declined it for now. Talk with the circle if you'd like to know more.`,
    url: `/circles/${circle.id}`,
    tag: `circle-application-${circle.id}`,
    exceptUserId: ctx.user.id,
    onlyUserIds: await userIdsForPeople([application.personId]),
  });
  return NextResponse.json({ ok: true });
}
