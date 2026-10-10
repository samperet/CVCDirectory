import type { NamedPerson } from "@/lib/people";

/**
 * Proposals — types and pure helpers, safe for the browser.
 *
 * A proposal is something put to a circle for its consent: a title, the
 * proposal itself (Markdown), the documents it's about (pages or files —
 * "adopt this policy"), and perhaps the day it's to be decided. It stays
 * **proposed** until the circle consents to it **at a meeting** — recorded
 * with the meeting (its notes, a page, or its minutes, a file), who was
 * there (and whether each was a member of the circle), the circle, and who
 * recorded it — or until it's **withdrawn**. A consented proposal can't be
 * changed (a new proposal changes it), and the documents it's about show as
 * consented at the versions they were then. A document can hold proposals
 * (`::proposal{id="…"}` on a line of its own), so meeting notes show the
 * proposals they decided.
 *
 * Each document a proposal is about is copied when it's attached — a
 * **snapshot** (`DocumentSnapshot`; see `snapshots.ts`) — so what's proposed,
 * and then consented, is the document as it was then, whatever happens to it
 * after. While the proposal waits for consent, a document that has changed
 * can have its snapshot taken again ("use the current version").
 */

export type ProposalStatus = "proposed" | "consented" | "withdrawn";

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  proposed: "Proposed",
  consented: "Consented",
  withdrawn: "Withdrawn",
};

/** A page (by its id) or an uploaded file or link (by its document id). */
export interface DocumentRef {
  kind: "page" | "file";
  id: string;
}

/** Who did something, as a proposal records it. */
export interface ProposalPerson {
  userId: string;
  personId: string | null;
  name: string;
}

/** The meeting a proposal was consented at: its notes (a page) or minutes (a file), as they were named then. */
export interface MeetingRef {
  kind: "page" | "file";
  id: string;
  title: string;
  /** The day of the meeting (YYYY-MM-DD). */
  date: string;
  circleId: string;
  /** Where its notes or minutes are (a page's address doesn't change when it's renamed). */
  href: string;
}

/** Someone at the meeting: a resident or a guest by name, and whether they were in the circle then. */
export type PresentPerson = NamedPerson & { member: boolean };

export interface ProposalConsent {
  meeting: MeetingRef;
  /** The circle that consented. */
  circleId: string;
  /** Who was at the meeting. */
  present: PresentPerson[];
  /** Anything to note with it ("with the amendment that…"). */
  note: string | null;
  /** Who recorded the consent. */
  submittedBy: ProposalPerson;
  submittedAt: string;
  /** The documents' versions consented to: a page's last save (`updatedAt`), a file's version number. */
  documents: (DocumentRef & { version: string })[];
}

/**
 * A copy of a document as it was when it was attached to a proposal: a
 * page's title and text, a file itself, or — for a link — where it went and
 * the text it had. The copy is kept apart (`snapshots.ts`); this says what
 * it is.
 */
export interface DocumentSnapshot extends DocumentRef {
  /** Where its copy is kept. */
  snapshotId: string;
  /** The version copied: a page's last save (`updatedAt`), a file's version number. */
  version: string;
  /** What the document was called then. */
  title: string;
  takenAt: string;
  takenBy: ProposalPerson;
  /** A page's keeper then. */
  page?: { keeper: string };
  /** A file's name, size and type — or, for a link, where it went. */
  file?: {
    fileName: string;
    size: number;
    contentType: string;
    viewable: boolean;
    link?: { url: string; kind: string };
  };
}

export interface Proposal {
  id: string;
  /** The circle asked to consent. */
  circleId: string;
  title: string;
  body: string;
  documents: DocumentRef[];
  /** A snapshot of each document, taken when it was attached (proposals from before snapshots have none). */
  snapshots?: DocumentSnapshot[];
  /** The day the circle means to decide (YYYY-MM-DD), if there is one. */
  decideOn: string | null;
  status: ProposalStatus;
  proposedBy: ProposalPerson;
  createdAt: string;
  updatedBy: ProposalPerson;
  updatedAt: string;
  consent: ProposalConsent | null;
  withdrawn: { by: ProposalPerson; at: string } | null;
}

/** A document a proposal is about, as it's shown: what it's called now, and where it is. */
export interface ProposalDocument extends DocumentRef {
  title: string;
  href: string | null;
  circleName: string;
  /** Gone. */
  missing: boolean;
  /** Its snapshot, and where to see it (none for documents attached before snapshots were kept). */
  snapshot: { snapshotId: string; title: string; takenAt: string; href: string } | null;
  /** It has changed since its snapshot was taken (a page saved again, a newer version of a file). */
  changed: boolean;
}

/** A proposal as it's shown on its own or in a document: names filled in, and what the reader may do. */
export interface ProposalView extends Proposal {
  circleName: string;
  documentsShown: ProposalDocument[];
  /** The pages that hold it. */
  appearsIn: { slug: string; title: string }[];
  /** Change it, withdraw it, or propose it again: whoever proposed it, the circle's members, the Board, admins. */
  canEdit: boolean;
  /** Record (or withdraw) the circle's consent: its members, the Board, admins. */
  canConsent: boolean;
}

/** A proposal in a list: enough to show it and link to it. */
export interface ProposalListing {
  kind: "proposal";
  id: string;
  circleId: string;
  circleName: string;
  title: string;
  status: ProposalStatus;
  decideOn: string | null;
  proposedBy: string;
  createdAt: string;
  updatedAt: string;
  consent: { date: string; meeting: MeetingRef } | null;
  documentCount: number;
  excerpt: string;
  snippet?: string | null;
}

/** A meeting a proposal could be consented at: notes or minutes kept by the circle, with a date. */
export interface MeetingOption {
  kind: "page" | "file";
  id: string;
  title: string;
  date: string;
  /** Who was there, if the notes say. */
  present: NamedPerson[];
  href: string;
}

/** A snapshot as it's opened (`GET /api/proposals/<id>/snapshots/<snapshotId>`). */
export interface SnapshotView {
  snapshot: DocumentSnapshot;
  proposal: Pick<Proposal, "id" | "title" | "circleId" | "status"> & { circleName: string };
  /** A page's text as it was (Markdown). */
  body: string | null;
  /** A link's text as it was (plain), if it could be read. */
  text: string | null;
  /** Who had last saved the page, and when (as it was then). */
  edited: { by: string; at: string } | null;
  /** Where to open a file's copy. */
  fileHref: string | null;
  /** The document as it is now, if it's still there: where it is, whether it has changed, and a page's text now. */
  current: { title: string; href: string; changed: boolean; body: string | null } | null;
  /** Whether you can take the snapshot again from the current version (the proposal waits for consent). */
  canRetake: boolean;
}

/** A proposal held in a page: `::proposal{id="…"}` on a line of its own. */
export const PROPOSAL_DIRECTIVE =
  /^[ \t]*::proposal\{[^}\n]*?(?:id="?([0-9a-f-]{36})"?|#([0-9a-f-]{36}))[^}\n]*\}[ \t]*$/gim;

/** The proposals a page holds, in order, each once. */
export function proposalIdsIn(markdown: string): string[] {
  const ids: string[] = [];
  for (const match of Array.from(markdown.matchAll(PROPOSAL_DIRECTIVE))) {
    const id = (match[1] ?? match[2]).toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export const proposalDirective = (id: string) => `::proposal{id="${id}"}`;

export const sameDocument = (a: DocumentRef, b: DocumentRef) => a.kind === b.kind && a.id === b.id;

/** A proposal's snapshot of one of its documents, if it has one. */
export const snapshotOf = (proposal: Pick<Proposal, "snapshots">, ref: DocumentRef) =>
  proposal.snapshots?.find((snapshot) => sameDocument(snapshot, ref)) ?? null;

/** The day a proposal is "for": when it was consented, else the day it was proposed. */
export const proposalDate = (proposal: Pick<Proposal, "consent" | "createdAt">) =>
  proposal.consent?.meeting.date ?? proposal.createdAt.slice(0, 10);

/** Proposals in the order they're coming up: the soonest to be decided first, then the newest. */
export function byDecision(
  a: Pick<Proposal, "decideOn" | "createdAt">,
  b: Pick<Proposal, "decideOn" | "createdAt">
) {
  return (
    (a.decideOn ?? "9999").localeCompare(b.decideOn ?? "9999") ||
    b.createdAt.localeCompare(a.createdAt)
  );
}

/**
 * Who was at a meeting, each marked as in the circle or not: residents in
 * its seats are members (everyone with a directory entry, for Community);
 * guests and other residents aren't.
 */
export function markMembers(
  present: NamedPerson[],
  memberIds: Set<string> | "everyone"
): PresentPerson[] {
  return present.map((person) => ({
    ...person,
    member: !!person.personId && (memberIds === "everyone" || memberIds.has(person.personId)),
  }));
}

/** The day a page's meeting was: its meeting date, or — for notes from before pages had one — the day they were started. */
export function meetingDateOf(page: {
  meetingDate?: string | null;
  present?: NamedPerson[];
  createdAt: string;
}): string | null {
  if (page.meetingDate) return page.meetingDate;
  return page.present?.length ? page.createdAt.slice(0, 10) : null;
}
