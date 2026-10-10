import { isAdmin } from "@/lib/auth/admins";
import { canUploadTo } from "@/lib/documents/access";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { WikiPageSummary } from "./store";
import { sitsOnBoard } from "@/lib/circles/ids";

/**
 * Who can edit and look after each wiki page. Every signed-in resident can
 * see every page. Each page sets its own (nothing is inherited from the page
 * it's under):
 *
 * - editing it: its keeper circle (the default), or any resident;
 * - looking after it — its keeper, who edits it, its consent — its keeper
 *   circle.
 *
 * "The keeper circle" means its members, the Board, and admins (and any
 * resident, for pages the Community circle keeps). The Board and admins can
 * always edit every page. A page moves only to a circle you're in (for the
 * Board and admins, any): join a circle first to give it a page.
 */

export type WikiViewer = { id: string; personId?: string | null; isAdmin?: boolean };
type Page = Pick<WikiPageSummary, "keeper" | "edit">;

const onBoard = (user: WikiViewer, directory: DirectoryDocument) =>
  isAdmin(user) || sitsOnBoard(directory.circles, user.personId);

/** Its keeper circle (its members, the Board, admins; anyone for Community). */
export const keepsPage = (
  user: WikiViewer,
  directory: DirectoryDocument,
  page: Pick<Page, "keeper">
) => canUploadTo(user, directory, page.keeper);

export function canEditPage(user: WikiViewer, directory: DirectoryDocument, page: Page) {
  return (
    keepsPage(user, directory, page) ||
    onBoard(user, directory) ||
    (page.edit.kind === "anyone" && !!user.personId)
  );
}

/** Change its keeper, who edits it, and its consent; delete it. */
export const canManagePage = (user: WikiViewer, directory: DirectoryDocument, page: Page) =>
  keepsPage(user, directory, page) || onBoard(user, directory);

/**
 * Give a page to `circleId`: those who look after it, and only to a circle
 * they're in (the Board and admins, any) — so no one moves a page out of
 * their own reach.
 */
export const canMovePageTo = (
  user: WikiViewer,
  directory: DirectoryDocument,
  page: Page,
  circleId: string
) => canManagePage(user, directory, page) && keepsPage(user, directory, { keeper: circleId });

/** The circles you could make a page's keeper: yours (and, for the Board and admins, any). */
export function circlesYouKeep(user: WikiViewer, directory: DirectoryDocument) {
  return directory.circles
    .filter((circle) => canUploadTo(user, directory, circle.id))
    .map((circle) => ({ id: circle.id, name: circle.name }));
}
