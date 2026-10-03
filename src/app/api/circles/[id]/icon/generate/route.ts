import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { iconKey, readCircleIcons, setCircleIcon } from "@/lib/circles/icons";
import { generateCircleIcon, iconGenerationConfigured } from "@/lib/circles/icon-generator";
import { problem, throttled } from "@/lib/http";
import { writeBinary } from "@/lib/storage";

export const dynamic = "force-dynamic";
// Drawing an icon often takes 20–60 seconds.
export const maxDuration = 120;

type Params = { params: { id: string } };

/**
 * Draw an icon for a circle that has none, in the style of the others
 * (`lib/circles/icon-generator.ts`). Asked for by the page right after a
 * circle is created; its members and the Board may ask. A circle that
 * already has an icon keeps it.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "circle-icon-generate");
  if (limited) return limited;
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;
  if (!iconGenerationConfigured()) return problem("Icon drawing isn't set up (OPENAI_KEY)", 503);
  if ((await readCircleIcons())[params.id]) return problem("This circle already has an icon", 409);
  const circle = ctx.directory.circles.find((entry) => entry.id === params.id)!;
  const result = await generateCircleIcon(circle);
  if (!result.ok)
    return problem(
      result.reason === "not_configured"
        ? "Icon drawing isn't set up (OPENAI_KEY)"
        : "The icon couldn't be drawn this time; upload one instead",
      result.reason === "not_configured" ? 503 : 502
    );
  // Someone may have uploaded one meanwhile: theirs stays.
  if ((await readCircleIcons())[params.id]) return problem("This circle already has an icon", 409);
  await writeBinary(iconKey(params.id), result.icon);
  await setCircleIcon(params.id, {
    contentType: result.icon.contentType,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
