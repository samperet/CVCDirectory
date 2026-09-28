import { NextRequest } from "next/server";
import { addComment, commentSchema } from "@/lib/resources/store";
import { invalid, resourceActor, resourceResponse } from "@/lib/resources/http";
import { getUserForPerson } from "@/lib/auth/users";
import { categorySlug } from "@/lib/resources/slug";
import { excerpt, notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!rateLimit(`resource-comments:${request.ip ?? "anonymous"}`)) return problem("Too many requests", 429, "Too Many Requests");
  const found = await resourceActor();
  if ("error" in found) return found.error;
  const parsed = commentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  const result = await addComment(params.id, found.actor, parsed.data.body);
  if (result.ok) {
    // Tell whoever made the recommendation, and everyone else who has commented on it.
    const item = result.value;
    const recommender = item.submittedBy.personId ? await getUserForPerson(item.submittedBy.personId) : null;
    const people = Array.from(new Set([...(recommender ? [recommender.id] : []), ...item.comments.map((comment) => comment.authorId)]));
    await notify({
      topic: "resources",
      title: `${found.actor.name} commented on ${item.title}`,
      body: excerpt(parsed.data.body),
      url: `/resources/${categorySlug(item.category)}`,
      tag: `resource-${item.id}`,
      exceptUserId: found.actor.userId,
      onlyUserIds: people,
    });
  }
  return resourceResponse(result, 201);
}
