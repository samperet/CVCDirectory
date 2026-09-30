import { searchTerms } from "@/lib/documents/types";
import { occurrences, snippetFor } from "@/lib/search";
import { ForumThreadDocument, getThread, listThreads } from "./store";

export interface ForumSearchHit {
  id: string;
  title: string;
  authorName: string;
  createdAt: string;
  lastActivityAt: string;
  replyCount: number;
  /** The passage that matched, who wrote it, and the reply it's in (null: the opening post). */
  snippet: string | null;
  snippetBy: string | null;
  replyId: string | null;
  score: number;
}

/** Read every discussion, a batch at a time. */
async function readThreads(ids: string[]) {
  const docs: ForumThreadDocument[] = [];
  for (let at = 0; at < ids.length; at += 25) {
    const batch = await Promise.all(ids.slice(at, at + 25).map((id) => getThread(id).catch(() => null)));
    for (const doc of batch) if (doc) docs.push(doc);
  }
  return docs;
}

/**
 * Discussions matching every term of the query, anywhere in the thread: its
 * title, opening post, replies, or who wrote them. Best first.
 */
export async function searchForum(query: string): Promise<ForumSearchHit[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const summaries = await listThreads();
  const docs = await readThreads(summaries.map((summary) => summary.id));
  const summaryOf = new Map(summaries.map((summary) => [summary.id, summary]));
  const hits: ForumSearchHit[] = [];

  for (const { thread, replies } of docs) {
    const live = replies.filter((reply) => !reply.deletedAt);
    // Each post, opening post first, with what can match in it.
    const posts = [
      { replyId: null, by: thread.authorName, body: thread.body },
      ...live.map((reply) => ({ replyId: reply.id, by: reply.authorName, body: reply.body })),
    ];
    const title = thread.title.toLowerCase();
    const bodies = posts.map((post) => post.body.toLowerCase());
    const names = posts.map((post) => post.by).join(" ").toLowerCase();
    let score = 0;
    let all = true;
    for (const term of terms) {
      const inTitle = occurrences(title, term);
      const inNames = occurrences(names, term);
      const inBodies = bodies.reduce((sum, body) => sum + occurrences(body, term), 0);
      if (!inTitle && !inNames && !inBodies) {
        all = false;
        break;
      }
      score += inTitle * 20 + Math.min(inNames, 5) * 3 + Math.min(inBodies, 20);
    }
    if (!all) continue;

    // Quote the post matching the most terms (the earliest, on a tie).
    let quoted: (typeof posts)[number] | null = null;
    let mostMatched = 0;
    for (const [index, post] of posts.entries()) {
      const matched = terms.filter((term) => bodies[index].includes(term)).length;
      if (matched > mostMatched) {
        quoted = post;
        mostMatched = matched;
      }
    }
    const summary = summaryOf.get(thread.id);
    hits.push({
      id: thread.id,
      title: thread.title,
      authorName: thread.authorName,
      createdAt: thread.createdAt,
      lastActivityAt: summary?.lastActivityAt ?? thread.createdAt,
      replyCount: summary?.replyCount ?? live.length,
      snippet: quoted ? snippetFor(quoted.body, terms) : null,
      snippetBy: quoted?.by ?? null,
      replyId: quoted?.replyId ?? null,
      score,
    });
  }
  return hits.sort((a, b) => b.score - a.score || b.lastActivityAt.localeCompare(a.lastActivityAt));
}
