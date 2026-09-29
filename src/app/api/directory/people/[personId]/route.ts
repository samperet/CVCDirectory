import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { removeUsersForPerson } from "@/lib/auth/users";
import { removePersonFromCircles } from "@/lib/circles/store";
import { canManageDirectory } from "@/lib/directory/access";
import { removePerson } from "@/lib/directory/people-store";
import { readDirectory, readImportedDirectory } from "@/lib/directory/store";
import { deleteProfile, isPersonId, photoKey } from "@/lib/profiles/store";
import { removeUserPush } from "@/lib/push/store";
import { deleteBinary } from "@/lib/storage";
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
  if (!user) return problem("Sign in to continue", 401, "Unauthorized");
  const [directory, imported] = await Promise.all([readDirectory(), readImportedDirectory()]);
  if (!directory || !imported) return problem("The directory hasn't been imported yet", 503, "Service Unavailable");
  if (!canManageDirectory(user, directory)) return problem("Only the Board Secretary and admins can remove people", 403, "Forbidden");
  if (!isPersonId(params.personId)) return problem("Person not found", 404, "Not Found");
  const person = directory.people.find((entry) => entry.id === params.personId);
  if (!person) return problem("Person not found", 404, "Not Found");
  if (person.id === user.personId) return problem("You can't remove yourself from the directory");

  await removePerson(person.id);
  await removePersonFromCircles(imported.circles, person.id);
  const closed = await removeUsersForPerson(person.id);
  await removeUserPush(closed);
  if (await deleteProfile(person.id)) await deleteBinary(photoKey(person.id));
  return NextResponse.json({ ok: true, removed: person.displayName });
}
