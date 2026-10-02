import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { problem } from "@/lib/http";
import { canEditPage, canManagePage, canViewPage } from "./access";
import { getPage, isSlug, type WikiPage } from "./store";
import { userIdsForPeople } from "@/lib/auth/users";
import type { Circle, DirectoryDocument } from "@/lib/directory/types";
import type { CommunityUser } from "@/lib/auth/users";
import { BOARD_ID, COMMUNITY_ID, isCommunity } from "@/lib/circles/ids";

/**
 * The wiki's routes: who's asking (any signed-in resident), and — for a
 * page — whether they can see it, edit it, or look after it (see
 * `access.ts`). A page someone can't see is "not found" to them.
 */

type Session = { user: CommunityUser; directory: DirectoryDocument; imported: Circle[] };
type PageSession = Session & { page: WikiPage; canEdit: boolean; canManage: boolean };

export async function wikiSession(): Promise<{ error: NextResponse } | Session> {
  const ctx = await circleContext();
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  return { user: ctx.user, directory: ctx.directory, imported: ctx.imported };
}

export async function pageContext(slug: string, need: "view" | "edit" | "manage" = "view"): Promise<{ error: NextResponse } | PageSession> {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx;
  const page: WikiPage | null = isSlug(slug) ? await getPage(slug) : null;
  if (!page || !canViewPage(ctx.user, ctx.directory, page)) return { error: wikiProblem("not_found") };
  const canEdit = canEditPage(ctx.user, ctx.directory, page);
  const canManage = canManagePage(ctx.user, ctx.directory, page);
  if (need === "edit" && !canEdit) return { error: problem("Only those this page is open to can edit it", 403) };
  if (need === "manage" && !canManage) return { error: problem("Only the circle that keeps this page (or the Board) can change that", 403) };
  return { ...ctx, page, canEdit, canManage };
}

export function wikiProblem(reason: "not_found" | "exists" | "full" | "no_version" | "conflict") {
  switch (reason) {
    case "not_found":
      return problem("That page no longer exists", 404);
    case "exists":
      return problem("A page with that title already exists", 409);
    case "full":
      return problem("The wiki has as many pages as it can hold", 409);
    case "no_version":
      return problem("That version no longer exists", 404);
    case "conflict":
      return problem("Someone else saved this page while you were editing it", 409);
  }
}

/** Who should hear about a page: everyone (null), or — for a page not everyone can see — those who can. */
export async function pageAudience(directory: DirectoryDocument, page: Pick<WikiPage, "keeper" | "view">): Promise<string[] | null> {
  if (page.view.kind === "everyone" || isCommunity(page.keeper)) return null;
  const circles = new Set([page.keeper, BOARD_ID, ...(page.view.kind === "circles" ? page.view.circles : [])]);
  if (circles.has(COMMUNITY_ID)) return null;
  const people = directory.circles.filter((circle) => circles.has(circle.id)).flatMap((circle) => circle.seats.map((seat) => seat.personId));
  return userIdsForPeople(people);
}

