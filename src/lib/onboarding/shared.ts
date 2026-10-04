/**
 * New member intake: the Board Secretary's welcome for people joining CVC.
 *
 * The Secretary invites a new member by email. The email links to a welcome
 * form of their own (`/join/<token>` — no account needed), which asks for a
 * short bio, including what drew them to cohousing, and the name and mobile
 * number they'll sign in with. The same page explains how to sign in and lists
 * the resources the Secretary has chosen (the Living in Community Guide
 * among them). Their answers come back to the Secretary, who adds them to the
 * directory; then they can sign in, and are emailed to say so.
 *
 * Types and pure rules, safe for the browser.
 */

/** What a new member tells us on their welcome form. */
export interface IntakeAnswers {
  firstName: string;
  lastName: string;
  /** Their mobile number, formatted (it's how they'll sign in). */
  phone: string;
  /** Their unit, if they know it. */
  unit: number | null;
  /** A short bio, including what drew them to cohousing. */
  bio: string;
  submittedAt: string;
}

export interface Invitation {
  id: string;
  /** Lowercased. */
  email: string;
  /** The name the Secretary knows them by, if given. */
  name: string | null;
  invitedBy: { personId: string | null; name: string };
  createdAt: string;
  /** When the welcome email last went (null if it never did: email wasn't set up, so the link was copied instead). */
  sentAt: string | null;
  answers: IntakeAnswers | null;
  /** Their directory entry, once the Secretary has added them (they can sign in from then on). */
  personId: string | null;
  addedAt: string | null;
}

/** Waiting for their answers, answered (for the Secretary to add them), or added to the directory. */
export type InvitationStatus = "waiting" | "answered" | "added";

export const invitationStatus = (
  invitation: Pick<Invitation, "answers" | "personId">
): InvitationStatus =>
  invitation.personId ? "added" : invitation.answers ? "answered" : "waiting";

/** How long a welcome link works after it was sent (sending it again starts the time over). */
export const LINK_DAYS = 60;

/** When the invitation's link stops working. */
export function linkExpiresAt(invitation: Pick<Invitation, "createdAt" | "sentAt">): string {
  const from = new Date(invitation.sentAt ?? invitation.createdAt).getTime();
  return new Date(from + LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export const linkExpired = (
  invitation: Pick<Invitation, "createdAt" | "sentAt">,
  now = new Date()
) => linkExpiresAt(invitation) <= now.toISOString();

/** Something on the welcome page to read: a document (a file in Documents), a wiki page, or a link. */
export type WelcomeResource =
  | { id: string; kind: "document"; documentId: string; note?: string }
  | { id: string; kind: "page"; pageId: string; note?: string }
  | { id: string; kind: "link"; title: string; url: string; note?: string };

/** A resource as the welcome page and the Secretary see it: with its current title, and where it opens. */
export type ShownResource = WelcomeResource & { title: string };

export const MAX_RESOURCES = 20;

/** The guide every new member should read; listed by default until the Secretary chooses. */
export const GUIDE_TITLE = /living in community/i;

/**
 * The resources listed until the Secretary saves a list: every document and
 * every page anyone can read whose title names the Living in Community Guide.
 */
export function defaultResources(
  documents: { id: string; title: string }[],
  pages: { id: string; title: string }[]
): WelcomeResource[] {
  return [
    ...documents
      .filter((doc) => GUIDE_TITLE.test(doc.title))
      .map(
        (doc): WelcomeResource => ({ id: `doc-${doc.id}`, kind: "document", documentId: doc.id })
      ),
    ...pages
      .filter((page) => GUIDE_TITLE.test(page.title))
      .map((page): WelcomeResource => ({ id: `page-${page.id}`, kind: "page", pageId: page.id })),
  ];
}

/**
 * Resources with their current titles, in order. A document or page that's
 * gone — or a page not everyone may read (leave those out of `pages`) — is
 * left out.
 */
export function showResources(
  list: WelcomeResource[],
  documents: { id: string; title: string }[],
  pages: { id: string; title: string }[]
): ShownResource[] {
  return list.flatMap((resource): ShownResource[] => {
    if (resource.kind === "link") return [resource];
    const found =
      resource.kind === "document"
        ? documents.find((doc) => doc.id === resource.documentId)
        : pages.find((page) => page.id === resource.pageId);
    return found ? [{ ...resource, title: found.title }] : [];
  });
}

/** What the new member's own welcome page gets from the API. */
export interface WelcomeView {
  /** The name the Secretary used, or the one they gave. */
  name: string | null;
  email: string;
  invitedBy: string;
  status: InvitationStatus;
  expired: boolean;
  answers: IntakeAnswers | null;
  /** Once added: the name to choose when signing in. */
  signInName: string | null;
  /** The sign-in page's address. */
  signInUrl: string;
  resources: ShownResource[];
}

/** An invitation as the Secretary sees it. */
export type InvitationListing = Invitation & {
  status: InvitationStatus;
  /** The welcome page's address, to copy and send another way. */
  link: string;
  expired: boolean;
  /** Once added: their name in the directory. */
  personName: string | null;
};
