import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminToken } from "@/lib/auth/admin-token";
import { readDirectory } from "@/lib/directory/store";
import { addRecommendations, listRecommendations, recommendationInputSchema } from "@/lib/resources/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

const seedSchema = z.object({
  /** The directory resident the recommendations came from. */
  submittedByPersonId: z.string().regex(/^[a-f0-9]{12}$/),
  recommendations: z.array(recommendationInputSchema).min(1).max(200),
});

/**
 * Add recommendations on a resident's behalf without a session. Requires
 * `Authorization: Bearer <ADMIN_TOKEN>`. They're credited to (and editable
 * by) that resident. GET reports how many there are.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  return NextResponse.json({ count: (await listRecommendations()).length });
}

export async function POST(request: NextRequest) {
  const denied = authorizeAdminToken(request);
  if (denied) return denied;
  const parsed = seedSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("; "));
  const person = (await readDirectory())?.people.find((entry) => entry.id === parsed.data.submittedByPersonId);
  if (!person) return problem("That resident isn't in the directory", 404);
  const result = await addRecommendations(
    parsed.data.recommendations.map((entry) => ({ ...entry, submittedBy: { personId: person.id, name: person.displayName } }))
  );
  if (!result.ok) return problem("There's no room for more recommendations", 409);
  return NextResponse.json({ added: result.value.length, submittedBy: person.displayName }, { status: 201 });
}
