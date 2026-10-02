import { NextRequest, NextResponse } from "next/server";
import { addLogEntry, listLog, logInputSchema } from "@/lib/log/store";
import { logContext, logProblem } from "@/lib/log/http";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's log (oldest first), and whether you can post to it or reply. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await logContext(params.id);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    {
      entries: await listLog(params.id),
      canPost: ctx.canPost,
      canReply: ctx.canReply,
      canModerate: ctx.canModerate,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Post an update (`parentId` unset) or reply to one. Nobody is notified: that's the point of the log. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "log");
  if (limited) return limited;
  const ctx = await logContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, logInputSchema);
  if ("error" in parsed) return parsed.error;
  if (parsed.data.parentId ? !ctx.canReply : !ctx.canPost)
    return problem(
      parsed.data.parentId
        ? "Sign in as a resident to reply"
        : `Only ${ctx.circle.name}'s members post updates here`,
      403
    );
  const result = await addLogEntry(params.id, ctx.actor, parsed.data);
  if (!result.ok) return logProblem(result.reason);
  return NextResponse.json({ entry: result.entry }, { status: 201 });
}
