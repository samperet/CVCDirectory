import { NextRequest, NextResponse } from "next/server";
import { removePinsOn } from "@/lib/pins/store";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { deleteThread, editThread, getThread, threadUpdateSchema } from "@/lib/forum/store";
import { forumProblem } from "@/lib/forum/http";
import { getTopic } from "@/lib/forum/topics";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const doc = await getThread(params.id);
  if (!doc) {
    return problem("Discussion not found", 404, "Not Found");
  }
  return NextResponse.json(doc);
}

/** Edit your own opening post (title and/or body) or move it to another topic; admins can edit any. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to edit", 401, "Unauthorized");

  const parsed = threadUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));

  if (parsed.data.topicId && !(await getTopic(parsed.data.topicId))) return problem("That topic no longer exists", 404, "Not Found");
  const result = await editThread(params.id, { id: user.id, admin: isAdmin(user) }, parsed.data);
  return result.ok ? NextResponse.json(result.doc) : forumProblem(result.reason);
}

/** Delete your own discussion while no one else has replied; admins can delete any. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to delete", 401, "Unauthorized");

  const result = await deleteThread(params.id, { id: user.id, admin: isAdmin(user) });
  if (result.ok) await removePinsOn({ kind: "thread", id: params.id });
  return result.ok ? NextResponse.json({ ok: true }) : forumProblem(result.reason);
}
