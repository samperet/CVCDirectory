import { getSessionUser } from "./session";
import { isAdmin } from "./admins";
import { actorOf } from "./actor";
import type { AdminEntry, Failure } from "./admin-store";
import { readDirectory } from "@/lib/directory/store";
import type { DirectoryDocument } from "@/lib/directory/types";
import { problem } from "@/lib/http";

/**
 * The Admin settings routes: admins only. Each admin is shown with their
 * name from the directory, and how they're an admin.
 */

export async function adminContext() {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) };
  if (!isAdmin(user)) return { error: problem("Only admins can change who the admins are", 403) };
  const directory = await readDirectory();
  if (!directory) return { error: problem("The directory hasn't been imported yet", 503) };
  return { user, actor: actorOf(user), directory };
}

/** An admin as the settings page shows them. */
export type AdminView = AdminEntry & { name: string; inDirectory: boolean; you: boolean };

export function adminViews(
  admins: AdminEntry[],
  directory: DirectoryDocument,
  personId: string | null | undefined
): AdminView[] {
  return admins.map((admin) => {
    const person = directory.people.find((entry) => entry.id === admin.personId);
    return {
      ...admin,
      name: person?.displayName ?? `Someone not in the directory (${admin.personId})`,
      inDirectory: !!person,
      you: admin.personId === personId,
    };
  });
}

export function adminProblem(reason: Failure) {
  switch (reason) {
    case "already":
      return problem("They're already an admin", 409);
    case "not_added":
      return problem("They aren't an admin added here", 404);
    case "fixed":
      return problem(
        "That admin is built in or set in Vercel (ADMIN_PERSON_IDS), so can't be removed here",
        409
      );
    case "last":
      return problem("There must always be at least one admin", 409);
  }
}
