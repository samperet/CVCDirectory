import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createViewAsValue, getRealSessionUser, viewAsCookieOptions } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { VIEW_AS_COOKIE } from "@/lib/auth/secret";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ personId: z.string().regex(/^[a-f0-9]{12}$/, "Choose a resident") });

/**
 * Admins: see the app as another resident does, read-only, for an hour.
 */
export async function POST(request: NextRequest) {
  const admin = await getRealSessionUser();
  if (!admin) return problem("Sign in to continue", 401);
  if (!isAdmin(admin)) return problem("Only admins can view the app as someone else", 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors[0].message);
  const person = (await readDirectory())?.people.find((entry) => entry.id === parsed.data.personId);
  if (!person) return problem("That resident isn't in the directory", 404);
  if (person.id === admin.personId) return problem("That's you — choose someone else");

  const response = NextResponse.json({ viewingAs: person.displayName });
  const { name, ...options } = viewAsCookieOptions();
  response.cookies.set(name, createViewAsValue(admin.id, person.id), options);
  return response;
}

/** Stop viewing as someone. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
