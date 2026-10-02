import { NextRequest } from "next/server";
import { addComment, commentSchema } from "@/lib/resources/store";
import { resourceActor, resourceResponse } from "@/lib/resources/http";
import { getUserForPerson } from "@/lib/auth/users";
import { categorySlug } from "@/lib/resources/slug";
import { excerpt, notify } from "@/lib/push/notify";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const limited = throttled(request, "resource-comments");
  if (limited) return limited;
  const found = await resourceActor();
  if ("error" in found) return found.error;
  const parsed = await readBody(request, commentSchema);
  if ("error" in parsed) return parsed.error;
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
