import type { PageConsent, PageProposal } from "@/lib/wiki/consent";
import type { DocumentConsent, DocumentProposal } from "@/lib/documents/types";
import { sameDocument, snapshotOf, type DocumentRef, type Proposal } from "./shared";

/**
 * What a page or file shows of the proposals about it — pure, for tests.
 * Pages and files keep a copy of where their proposals stand (`proposal`,
 * `consent`, each with a `proposalId`), so everything that shows a
 * document's stage keeps working from the document alone:
 *
 * - `proposal`: the newest open proposal about it (for a page, with the
 *   version its snapshot holds);
 * - `consent`: the latest consent given to a proposal about it (the latest
 *   meeting), at the version it was consented at; those who consented are
 *   the circle's members who were there.
 *
 * A record from before proposals (no `proposalId`) stays until a proposal
 * takes its place.
 */

const about = (proposal: Proposal, ref: DocumentRef) =>
  proposal.documents.some((entry) => sameDocument(entry, ref));

function openFor(ref: DocumentRef, proposals: Proposal[]) {
  return (
    proposals
      .filter((proposal) => proposal.status === "proposed" && about(proposal, ref))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

function consentedFor(ref: DocumentRef, proposals: Proposal[]) {
  return (
    proposals
      .filter(
        (proposal) =>
          proposal.status === "consented" &&
          proposal.consent?.documents.some((entry) => sameDocument(entry, ref))
      )
      .sort(
        (a, b) =>
          b.consent!.meeting.date.localeCompare(a.consent!.meeting.date) ||
          b.consent!.submittedAt.localeCompare(a.consent!.submittedAt)
      )[0] ?? null
  );
}

const consentedBy = (proposal: Proposal) =>
  (proposal.consent?.present ?? [])
    .filter((person) => person.member)
    .map(({ member: _member, ...person }) => person);

const versionOf = (proposal: Proposal, ref: DocumentRef) =>
  proposal.consent?.documents.find((entry) => sameDocument(entry, ref))?.version ?? "";

export function pageMirror(
  page: { id: string; proposal?: PageProposal | null; consent?: PageConsent | null },
  proposals: Proposal[]
): { proposal: PageProposal | null; consent: PageConsent | null } {
  const ref: DocumentRef = { kind: "page", id: page.id };
  const open = openFor(ref, proposals);
  const done = consentedFor(ref, proposals);
  const proposed = open ? snapshotOf(open, ref)?.version : undefined;
  return {
    proposal: open
      ? {
          by: { userId: open.proposedBy.userId, name: open.proposedBy.name },
          at: open.createdAt,
          decideOn: open.decideOn,
          proposalId: open.id,
          title: open.title,
          circleId: open.circleId,
          ...(proposed ? { version: proposed } : {}),
        }
      : page.proposal && !page.proposal.proposalId
        ? page.proposal
        : null,
    consent:
      done && done.consent
        ? {
            date: done.consent.meeting.date,
            consentedBy: consentedBy(done),
            recordedBy: {
              userId: done.consent.submittedBy.userId,
              name: done.consent.submittedBy.name,
            },
            recordedAt: done.consent.submittedAt,
            version: versionOf(done, ref),
            proposalId: done.id,
            meeting: done.consent.meeting,
          }
        : page.consent && !page.consent.proposalId
          ? page.consent
          : null,
  };
}

export function fileMirror(
  doc: { id: string; proposal?: DocumentProposal | null; consent?: DocumentConsent | null },
  proposals: Proposal[]
): { proposal: DocumentProposal | null; consent: DocumentConsent | null } {
  const ref: DocumentRef = { kind: "file", id: doc.id };
  const open = openFor(ref, proposals);
  const done = consentedFor(ref, proposals);
  return {
    proposal: open
      ? {
          proposalId: open.id,
          title: open.title,
          circleId: open.circleId,
          by: { personId: open.proposedBy.personId, name: open.proposedBy.name },
          at: open.createdAt,
          decideOn: open.decideOn,
        }
      : null,
    consent:
      done && done.consent
        ? {
            version: Number(versionOf(done, ref)) || 0,
            date: done.consent.meeting.date,
            consentedBy: consentedBy(done),
            recordedBy: {
              personId: done.consent.submittedBy.personId,
              name: done.consent.submittedBy.name,
            },
            recordedAt: done.consent.submittedAt,
            proposalId: done.id,
            meeting: done.consent.meeting,
          }
        : doc.consent && !doc.consent.proposalId
          ? doc.consent
          : null,
  };
}

/** Whether a copy differs from what's stored (so unchanged documents aren't rewritten). */
export const differs = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
