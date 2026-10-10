import { NextRequest, NextResponse } from "next/server";
import { pageContext, perspectiveProblem } from "@/lib/wiki/http";
import { sharePerspective } from "@/lib/wiki/perspectives";
import { versionOf } from "@/lib/wiki/perspectives-shared";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Share your version with the page's circle (once): its members, and those
 * who wrote the page, are told.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const limited = throttled(request, "perspective-share");
  if (limited) return limited;
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  const result = await sharePerspective(ctx.page.id, params.id, ctx.actor);
  if (!result.ok) return perspectiveProblem(result.reason);
  const { perspective, fresh } = result.value;
  if (fresh) {
    const circle = ctx.directory.circles.find((entry) => entry.id === ctx.page.keeper);
    const members = await userIdsForPeople(circle?.seats.map((seat) => seat.personId) ?? []);
    await notify({
      topic: "proposals",
      title: `${ctx.user.name} wrote a version of “${ctx.page.title}”`,
      body: `${versionOf(perspective.createdBy)}: ${perspective.name}`,
      url: `/wiki/${ctx.page.slug}/versions/${perspective.id}`,
      tag: `perspective-${perspective.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: Array.from(
        new Set([...members, ctx.page.createdBy.userId, ctx.page.updatedBy.userId])
      ),
    });
  }
  return NextResponse.json({ perspective });
}
