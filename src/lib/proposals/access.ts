import { canUploadTo } from "@/lib/documents/access";
import { canRecordConsent } from "@/lib/circles/consent";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { Proposal } from "./shared";

/**
 * Who may do what with proposals. Every signed-in resident sees them, and
 * the snapshots of the documents they're about.
 *
 * - Putting a proposal to a circle: whoever can start that circle's
 *   documents — its members, the Board, admins (any resident, for Community).
 * - Changing, withdrawing, proposing again, or deleting one that was never
 *   consented: whoever proposed it, and those who record the circle's consent.
 * - Recording (or withdrawing) the circle's consent: its members, the Board,
 *   and admins (`canRecordConsent`; the Board, for Community).
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
