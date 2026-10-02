import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canManageDirectory } from "@/lib/directory/access";
import { findPerson, removeFromDirectory } from "@/lib/directory/manage";
import { readDirectory, readImportedDirectory } from "@/lib/directory/store";
import { isPersonId } from "@/lib/profiles/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Remove someone from the directory: the Board Secretary or an admin. They
 * leave every circle, their account closes (ending any session, so they can
 * no longer sign in), and their profile, photo, and notifications go too.
 * What they posted stays, under their name.
 */
export async function DELETE(_request: Request, { params }: { params: { personId: string } }) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const [directory, imported] = await Promise.all([readDirectory(), readImportedDirectory()]);
  if (!directory || !imported) return problem("The directory hasn't been imported yet", 503);
  if (!canManageDirectory(user, directory))
    return problem("Only the Board Secretary and admins can remove people", 403);
  if (!isPersonId(params.personId)) return problem("Person not found", 404);
  const person = findPerson(directory, params.personId);
  if (!person) return problem("Person not found", 404);
  if (person.id === user.personId) return problem("You can't remove yourself from the directory");

  await removeFromDirectory(directory, imported.circles, person);
  return NextResponse.json({ ok: true, removed: person.displayName });
}
