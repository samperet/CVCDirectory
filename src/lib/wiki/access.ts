import { isAdmin } from "@/lib/auth/admins";
import { canManageCircle } from "@/lib/circles/icons";
import { canUploadTo } from "@/lib/documents/access";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { WikiPageSummary } from "./store";
import { COMMUNITY_ID, sitsOnBoard } from "@/lib/circles/ids";

/**
 * Who can see, edit, and look after each wiki page. Each page sets its own
 * (nothing is inherited from the page it's under):
 *
 * - seeing it: everyone (the default), its keeper circle, or its keeper and
 *   chosen circles;
 * - editing it: its keeper circle (the default), or any resident;
 * - looking after it — its keeper, who sees and edits it, its consent —
 *   its keeper circle.
 *
 * "The keeper circle" means its members, the Board, and admins (and any
 * resident, for pages the Community circle keeps). The Board and admins can
 * always see and edit every page.
 */

export type WikiViewer = { id: string; personId?: string | null; isAdmin?: boolean };
type Page = Pick<WikiPageSummary, "keeper" | "view" | "edit">;

const onBoard = (user: WikiViewer, directory: DirectoryDocument) =>
  isAdmin(user) || sitsOnBoard(directory.circles, user.personId);

/** Its keeper circle (its members, the Board, admins; anyone for Community). */
export const keepsPage = (
  user: WikiViewer,
  directory: DirectoryDocument,
  page: Pick<Page, "keeper">
) => canUploadTo(user, directory, page.keeper);

export function canViewPage(user: WikiViewer, directory: DirectoryDocument, page: Page) {
  if (page.view.kind === "everyone") return true;
  if (keepsPage(user, directory, page) || onBoard(user, directory)) return true;
  if (page.view.kind === "circles" && user.personId) {
    return page.view.circles.some(
      (circleId) =>
        circleId === COMMUNITY_ID || canManageCircle(directory, circleId, user.personId!)
    );
  }
  return false;
}

export function canEditPage(user: WikiViewer, directory: DirectoryDocument, page: Page) {
  if (!canViewPage(user, directory, page)) return false;
  return (
    keepsPage(user, directory, page) ||
    onBoard(user, directory) ||
    (page.edit.kind === "anyone" && !!user.personId)
  );
}

/** Change its keeper, who sees and edits it, and its consent; delete it. */
export const canManagePage = (user: WikiViewer, directory: DirectoryDocument, page: Page) =>
  keepsPage(user, directory, page) || onBoard(user, directory);

/** The circles you could make a new page's keeper: yours (and, for the Board and admins, any). */
export function circlesYouKeep(user: WikiViewer, directory: DirectoryDocument) {
  return directory.circles
    .filter((circle) => canUploadTo(user, directory, circle.id))
    .map((circle) => ({ id: circle.id, name: circle.name }));
}

/** Only the pages someone can see. */
export const visiblePages = <T extends Page>(
  user: WikiViewer,
  directory: DirectoryDocument,
  pages: T[]
) => pages.filter((page) => canViewPage(user, directory, page));
