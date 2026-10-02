import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { getUserForPerson } from "@/lib/auth/users";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";
import { readJson } from "@/lib/storage";
import { createPage, readPages } from "@/lib/wiki/store";
import { wikiProblem } from "@/lib/wiki/http";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY — remove after use. Adds a wiki page brought in from elsewhere on
 * a resident's behalf, without a session. Requires
 * `Authorization: Bearer <ADMIN_TOKEN>`. GET returns the stored pages document
 * (the backup to take first), the circles, and each circle's page titles; POST
 * adds one page, credited to that resident's account.
 */

const inputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(200_000),
  keeper: z.string().min(1).max(64),
  authorPersonId: z.string().regex(/^[a-f0-9]{12}$/),
});

export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const [stored, pages, directory] = await Promise.all([
    readJson("wiki/pages.json"),
    readPages(),
    readDirectory(),
  ]);
  return NextResponse.json(
    {
      stored,
      circles: (directory?.circles ?? []).map((circle) => ({
        id: circle.id,
        name: circle.name,
        pages: pages.filter((page) => page.keeper === circle.id).map((page) => page.title),
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return problem(
      parsed.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("; ")
    );
  const { title, body, keeper, authorPersonId } = parsed.data;
  const directory = await readDirectory();
  if (!directory?.circles.some((circle) => circle.id === keeper))
    return problem("That circle isn't in the directory", 404);
  const user = await getUserForPerson(authorPersonId);
  if (!user) return problem("That resident hasn't signed in yet", 404);
  const result = await createPage({ userId: user.id, name: user.name }, { title, body, keeper });
  if (!result.ok) return wikiProblem(result.reason);
  const page = result.page;
  return NextResponse.json(
    { page: page ? { id: page.id, slug: page.slug, title: page.title } : null },
    { status: 201 }
  );
}
