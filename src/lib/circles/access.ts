import { getSessionUser } from "@/lib/auth/session";
import { readDirectory, readImportedDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";
import { BOARD_ID } from "./store";
import { canManageCircle, isCircleId } from "./icons";
import { isAdmin } from "@/lib/auth/admins";

type Failure = "not_found" | "exists" | "duplicate_member" | "last_board_member" | "already_applied" | "not_member" | "full";

/** Map a circle store failure to an HTTP problem response. */
export function circleProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That circle or member no longer exists", 404, "Not Found");
    case "exists":
      return problem("A circle with that name already exists", 409, "Conflict");
    case "duplicate_member":
      return problem("That resident is already in this circle", 409, "Conflict");
    case "last_board_member":
      return problem("The Board needs at least one member", 409, "Conflict");
    case "already_applied":
      return problem("You've already applied to this circle", 409, "Conflict");
    case "not_member":
      return problem("You're not in this circle", 409, "Conflict");
    case "full":
      return problem("This circle has too many open applications — ask a member", 409, "Conflict");
  }
}

/**
 * Load the signed-in resident, the directory, and the imported circles (used
 * to seed the circle store), and optionally check they may manage a circle.
 * Admins pass every check.
 */
export async function circleContext(options: { circleId?: string; require?: "member-or-board" | "board" } = {}) {
  const user = await getSessionUser();
  if (!user?.personId) return { error: problem("Sign in to manage circles", 401, "Unauthorized") } as const;
  const [directory, imported] = await Promise.all([readDirectory(), readImportedDirectory()]);
  if (!directory || !imported) return { error: problem("The directory hasn't been imported yet", 503, "Service Unavailable") } as const;

  const { circleId, require } = options;
  if (circleId !== undefined) {
    if (!isCircleId(circleId) || !directory.circles.some((circle) => circle.id === circleId)) {
      return { error: problem("Circle not found", 404, "Not Found") } as const;
    }
    const admin = isAdmin(user);
    if (require === "member-or-board" && !admin && !canManageCircle(directory, circleId, user.personId)) {
      return { error: problem("Only this circle's members or the Board can change it", 403, "Forbidden") } as const;
    }
    if (require === "board" && !admin && !canManageCircle(directory, BOARD_ID, user.personId)) {
      return { error: problem("Only the Board can do that", 403, "Forbidden") } as const;
    }
  }
  return { user, personId: user.personId, directory, imported: imported.circles } as const;
}
