import { readMyDocuments } from "@/lib/me/documents";
import { json, lookup, reader, resolved } from "@/lib/me/http";

export const dynamic = "force-dynamic";

/**
 * Your starred documents (most recently starred first) and those you've
 * opened lately (most recent first): pages, files and proposals, each with
 * its title, address and circle. Anything deleted since, or in the trash,
 * is left out.
 */
export async function GET() {
  const ctx = await reader();
  if ("error" in ctx) return ctx.error;
  const [lists, find] = await Promise.all([readMyDocuments(ctx.user.id), lookup()]);
  return json({ starred: resolved(lists.starred, find), recent: resolved(lists.recent, find) });
}
