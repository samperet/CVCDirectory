import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canManageDirectory } from "@/lib/directory/access";
import { findPerson, leaveUnit } from "@/lib/directory/manage";
import { applyPeopleChanges, readPeopleChanges } from "@/lib/directory/people-store";
import { readDirectory, readImportedDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Take someone listed in several households out of one of them: the Board Secretary or an admin. */
export async function DELETE(
  _request: Request,
  { params }: { params: { personId: string; unit: string } }
) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const [directory, imported, changes] = await Promise.all([
    readDirectory(),
    readImportedDirectory(),
    readPeopleChanges(),
  ]);
  if (!directory || !imported) return problem("The directory hasn't been imported yet", 503);
  if (!canManageDirectory(user, directory))
    return problem("Only the Board Secretary and admins can do that", 403);
  const person = findPerson(directory, params.personId);
  if (!person) return problem("Person not found", 404);
  const result = await leaveUnit(
    directory,
    applyPeopleChanges(imported.people, changes),
    person,
    Number(params.unit)
  );
  if (result === "not_listed")
    return problem(`${person.displayName} isn't listed in that unit`, 404);
  if (result === "only_unit")
    return problem(
      `That's ${person.displayName}'s only unit — remove them from the directory instead`
    );
  return NextResponse.json({ ok: true });
}
