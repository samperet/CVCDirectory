import { NextRequest, NextResponse } from "next/server";
import { readBody, throttled } from "@/lib/http";
import { secretaryContext } from "@/lib/onboarding/http";
import { resourceChoices } from "@/lib/onboarding/resources";
import { defaultResources, showResources } from "@/lib/onboarding/shared";
import { readResources, resourcesSchema, saveResources } from "@/lib/onboarding/store";

export const dynamic = "force-dynamic";

/**
 * What new members' welcome pages list (`saved`: false while it's the default,
 * the Living in Community Guide), and what can be added: every document, and
 * every page but those once set to be seen only by some circles.
 */
async function state(circleNames: Map<string, string>) {
  const [saved, { documents, pages }] = await Promise.all([readResources(), resourceChoices()]);
  return {
    resources: showResources(
      saved?.resources ?? defaultResources(documents, pages),
      documents,
      pages
    ),
    saved: !!saved,
    choices: {
      documents: documents
        .map((doc) => ({
          id: doc.id,
          title: doc.title,
          circleName: circleNames.get(doc.circleId) ?? "Board",
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
      pages: pages
        .map((page) => ({ id: page.id, title: page.title }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    },
  };
}

export async function GET() {
  const ctx = await secretaryContext();
  if ("error" in ctx) return ctx.error;
  const names = new Map(ctx.directory.circles.map((circle) => [circle.id, circle.name]));
  return NextResponse.json(await state(names), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Save the list, in order. */
export async function PUT(request: NextRequest) {
  const limited = throttled(request, "secretary");
  if (limited) return limited;
  const ctx = await secretaryContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, resourcesSchema);
  if ("error" in parsed) return parsed.error;
  await saveResources(ctx.actor, parsed.data.resources);
  const names = new Map(ctx.directory.circles.map((circle) => [circle.id, circle.name]));
  return NextResponse.json(await state(names));
}
