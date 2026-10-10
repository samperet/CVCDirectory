import { canUploadTo } from "@/lib/documents/access";
import { canRecordConsent } from "@/lib/circles/consent";
import { canViewPage } from "@/lib/wiki/access";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { WikiPage } from "@/lib/wiki/store";
import type { DocumentSnapshot, Proposal } from "./shared";

/**
 * Who may do what with proposals. Every signed-in resident sees them.
 *
 * - Putting a proposal to a circle: whoever can start that circle's
 *   documents — its members, the Board, admins (any resident, for Community).
 * - Changing, withdrawing, proposing again, or deleting one that was never
 *   consented: whoever proposed it, and those who record the circle's consent.
 * - Recording (or withdrawing) the circle's consent: its members, the Board,
 *   and admins (`canRecordConsent`; the Board, for Community).
 * - Seeing a snapshot of a document it's about: a file's, everyone; a
 *   page's, whoever can see the page (or could, once it's gone).
 */

type Viewer = { id: string; personId?: string | null };

export const canPropose = (user: Viewer, directory: DirectoryDocument, circleId: string) =>
  canUploadTo(user, directory, circleId);

export const canConsentProposal = (
  user: Viewer,
  directory: DirectoryDocument,
  proposal: Pick<Proposal, "circleId">
) => canRecordConsent(user, directory, proposal.circleId);

export const canEditProposal = (
  user: Viewer,
  directory: DirectoryDocument,
  proposal: Pick<Proposal, "circleId" | "proposedBy">
) =>
  proposal.proposedBy.userId === user.id ||
  (!!user.personId && proposal.proposedBy.personId === user.personId) ||
  canConsentProposal(user, directory, proposal);

/**
 * Whether you may see a snapshot: a file's, anyone signed in (as with
 * documents); a page's, whoever can see the page — or, once it's gone,
 * whoever could have seen it as it was.
 */
export function canSeeSnapshot(
  snapshot: DocumentSnapshot,
  viewer: { user: Viewer & { isAdmin?: boolean }; directory: DirectoryDocument },
  pages: WikiPage[]
) {
  if (snapshot.kind === "file") return true;
  const page = pages.find((entry) => entry.id === snapshot.id);
  if (page) return canViewPage(viewer.user, viewer.directory, page);
  return (
    !!snapshot.page &&
    canViewPage(viewer.user, viewer.directory, { ...snapshot.page, edit: { kind: "keeper" } })
  );
}
