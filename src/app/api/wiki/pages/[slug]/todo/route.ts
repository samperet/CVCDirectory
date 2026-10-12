import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPage, updatePage } from "@/lib/wiki/store";
import { pageContext, wikiProblem } from "@/lib/wiki/http";
import { toggleTodo } from "@/lib/wiki/todos";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

const todoSchema = z.object({
  /** Which of the page's to-do items, in order. */
  index: z.number().int().min(0).max(5000),
  checked: z.boolean(),
  /** Its words, as the reader saw them (so a tick never lands on another item). */
  text: z.string().max(5000),
});

/**
 * Tick a to-do item off (or not) while reading — the page's editors. The
 * page's latest text is changed, if that item is still there as it was, and
 * saved like an autosave (a run of ticks makes one version in its history).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "wiki-todo", "Too many ticks: wait a moment", 120);
  if (limited) return limited;
  const ctx = await pageContext(params.slug, "edit");
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, todoSchema);
  if ("error" in parsed) return parsed.error;
  const { index, checked, text } = parsed.data;
  // Someone else may save in between: then try again on their text.
  for (let attempt = 0; attempt < 3; attempt++) {
    const page = attempt ? await getPage(params.slug) : ctx.page;
    if (!page) return wikiProblem("not_found");
    const body = toggleTodo(page.body, index, checked, text);
    if (body === null) return problem("That list has changed: reload the page to see it", 409);
    if (body === page.body) return NextResponse.json({ page });
    const result = await updatePage(params.slug, ctx.actor, {
      body,
      baseUpdatedAt: page.updatedAt,
      autosave: true,
    });
    if (result.ok) return NextResponse.json({ page: result.page });
    if (result.reason !== "conflict") return wikiProblem(result.reason);
  }
  return problem("The page is being saved by someone else: try again", 409);
}
