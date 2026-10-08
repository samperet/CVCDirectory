import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { problem } from "@/lib/http";
import { occurrences } from "@/lib/search";
import type { Actor } from "@/lib/auth/actor";
import type { CommunityUser } from "@/lib/auth/users";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify, excerpt } from "@/lib/push/notify";
import { isCommunity } from "@/lib/circles/ids";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { NamedPerson } from "@/lib/people";
import {
  createPage,
  readPages,
  setPageDecisions,
  updatePage,
  type WikiPage,
} from "@/lib/wiki/store";
import { canEditPage, canViewPage, visiblePages } from "@/lib/wiki/access";
import { listDocuments, setDocumentDecisions } from "@/lib/documents/store";
import { currentVersion, type DocumentRecord } from "@/lib/documents/types";
import { shortDate, todayInVermont } from "@/lib/time";
import { canConsentProposal, canEditProposal } from "./access";
import { fileMirror, pageMirror } from "./mirror";
import { listProposals, type Failure } from "./store";
import {
  meetingDateOf,
  proposalIdsIn,
  type DocumentRef,
  type MeetingOption,
  type MeetingRef,
  type Proposal,
  type ProposalListing,
  type ProposalView,
} from "./shared";

/**
 * The proposals routes' helpers: who's asking, what a proposal looks like
 * to them (its documents named, the pages that hold it, what they may do),
 * the meetings it could be consented at, keeping the documents it's about
 * up to date with where it stands, and telling people about it.
 */

export type ProposalSession = { user: CommunityUser; actor: Actor; directory: DirectoryDocument };

export async function proposalSession(): Promise<{ error: NextResponse } | ProposalSession> {
  const ctx = await circleContext();
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  return { user: ctx.user, actor: ctx.actor, directory: ctx.directory };
}

/** How well a proposal matches search terms (every term in its title or text): 0 if it doesn't. */
export function proposalScore(proposal: Proposal, terms: string[]) {
  const title = proposal.title.toLowerCase();
  const body = proposal.body.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const inTitle = occurrences(title, term);
    const inBody = occurrences(body, term);
    if (!inTitle && !inBody) return 0;
    score += inTitle * 20 + Math.min(inBody, 20);
  }
  return score;
}

export function proposalProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That proposal no longer exists", 404);
    case "full":
      return problem("There are as many proposals as can be kept", 409);
    case "not_open":
      return problem("That proposal isn't waiting for consent", 409);
    case "consented":
      return problem("A consented proposal can't be changed — make a new proposal instead", 409);
  }
}

export const circleNameOf = (directory: DirectoryDocument, circleId: string) =>
  directory.circles.find((circle) => circle.id === circleId)?.name ?? "A circle";

/** The residents in a circle's seats (everyone, for Community). */
export function memberIdsOf(
  directory: DirectoryDocument,
  circleId: string
): Set<string> | "everyone" {
  if (isCommunity(circleId)) return "everyone";
  return new Set(
    directory.circles
      .find((circle) => circle.id === circleId)
      ?.seats.map((seat) => seat.personId)
      .filter((id): id is string => !!id) ?? []
  );
}

/** A proposal as the reader sees it. */
export function viewOf(
  proposal: Proposal,
  ctx: ProposalSession,
  pages: WikiPage[],
  documents: DocumentRecord[]
): ProposalView {
  const { user, directory } = ctx;
  return {
    ...proposal,
    circleName: circleNameOf(directory, proposal.circleId),
    documentsShown: proposal.documents.map((ref) => {
      if (ref.kind === "page") {
        const page = pages.find((entry) => entry.id === ref.id);
        return page && canViewPage(user, directory, page)
          ? {
              ...ref,
              title: page.title,
              href: `/wiki/${page.slug}`,
              circleName: circleNameOf(directory, page.keeper),
              missing: false,
            }
          : {
              ...ref,
              title: "A page that's gone or private",
              href: null,
              circleName: "",
              missing: true,
            };
      }
      const doc = documents.find((entry) => entry.id === ref.id);
      return doc
        ? {
            ...ref,
            title: doc.title,
            href: `/api/documents/${doc.id}/file`,
            circleName: circleNameOf(directory, doc.circleId),
            missing: false,
          }
        : { ...ref, title: "A document that's gone", href: null, circleName: "", missing: true };
    }),
    appearsIn: visiblePages(user, directory, pages)
      .filter((page) => proposalIdsIn(page.body).includes(proposal.id))
      .map((page) => ({ slug: page.slug, title: page.title })),
    canEdit: canEditProposal(user, directory, proposal),
    canConsent: canConsentProposal(user, directory, proposal),
  };
}

/** A proposal in a list. */
export function listingOf(
  proposal: Proposal,
  directory: DirectoryDocument,
  snippet?: string | null
): ProposalListing {
  const flat = proposal.body
    .replace(/::proposal\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    kind: "proposal",
    id: proposal.id,
    circleId: proposal.circleId,
    circleName: circleNameOf(directory, proposal.circleId),
    title: proposal.title,
    status: proposal.status,
    decideOn: proposal.decideOn,
    proposedBy: proposal.proposedBy.name,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    consent: proposal.consent
      ? { date: proposal.consent.meeting.date, meeting: proposal.consent.meeting }
      : null,
    documentCount: proposal.documents.length,
    excerpt: flat.length > 220 ? `${flat.slice(0, 219)}…` : flat,
    ...(snippet !== undefined ? { snippet } : {}),
  };
}

/** Bring the pages and files these refer to up to date with where their proposals stand. */
export async function syncDocuments(refs: DocumentRef[]) {
  if (!refs.length) return;
  const proposals = await listProposals();
  const pageIds = refs.filter((ref) => ref.kind === "page").map((ref) => ref.id);
  const fileIds = refs.filter((ref) => ref.kind === "file").map((ref) => ref.id);
  if (pageIds.length) await setPageDecisions(pageIds, (page) => pageMirror(page, proposals));
  if (fileIds.length) await setDocumentDecisions(fileIds, (doc) => fileMirror(doc, proposals));
}

/** The meetings of a circle a proposal could be consented at: its notes and minutes with a date, the latest first. */
export function meetingsOf(
  circleId: string,
  ctx: ProposalSession,
  pages: WikiPage[],
  documents: DocumentRecord[]
): MeetingOption[] {
  const today = todayInVermont();
  const fromPages: MeetingOption[] = visiblePages(ctx.user, ctx.directory, pages)
    .filter((page) => page.keeper === circleId)
    .flatMap((page) => {
      const date = meetingDateOf(page);
      return date && date <= today
        ? [
            {
              kind: "page" as const,
              id: page.id,
              title: page.title,
              date,
              present: page.present ?? [],
              href: `/wiki/${page.slug}`,
            },
          ]
        : [];
    });
  const fromFiles: MeetingOption[] = documents
    .filter((doc) => doc.circleId === circleId && doc.meetingDate && doc.meetingDate <= today)
    .map((doc) => ({
      kind: "file" as const,
      id: doc.id,
      title: doc.title,
      date: doc.meetingDate!,
      present: [],
      href: `/api/documents/${doc.id}/file`,
    }));
  return [...fromPages, ...fromFiles]
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
    .slice(0, 40);
}

export type MeetingChoice = { kind: "page" | "file"; id: string } | { kind: "new"; date: string };

/**
 * The meeting a consent names: notes or minutes kept by the proposal's
 * circle, dated today or before — or, for a meeting with no notes yet, new
 * notes started for it (named for the circle and the day, with who was
 * there). Who was there comes from the notes when they say; otherwise from
 * `present`, which is then saved to the notes too (when the recorder can
 * edit them).
 */
export async function resolveMeeting(
  choice: MeetingChoice,
  circleId: string,
  present: NamedPerson[] | undefined,
  ctx: ProposalSession
): Promise<{ meeting: MeetingRef; present: NamedPerson[]; notes?: WikiPage } | { error: string }> {
  const today = todayInVermont();
  const circleName = circleNameOf(ctx.directory, circleId);
  if (choice.kind === "new") {
    if (choice.date > today) return { error: "The meeting can't be in the future" };
    if (!present?.length) return { error: "Say who was at the meeting" };
    const title = `${circleName} meeting, ${shortDate(choice.date, true)}`;
    const existing = (await readPages()).find(
      (page) => page.title.toLowerCase() === title.toLowerCase()
    );
    const page = existing
      ? existing
      : await createPage(
          { userId: ctx.actor.userId, name: ctx.actor.name },
          { title, body: "", keeper: circleId, meetingDate: choice.date, present }
        ).then((result) => (result.ok ? result.page : null));
    if (!page) return { error: "The meeting's notes couldn't be started" };
    if (page.keeper !== circleId)
      return { error: `“${title}” isn't ${circleName}'s — choose its notes instead` };
    return {
      meeting: {
        kind: "page",
        id: page.id,
        title: page.title,
        date: meetingDateOf(page) ?? choice.date,
        circleId: page.keeper,
        href: `/wiki/${page.slug}`,
      },
      present: page.present?.length ? page.present : present,
      notes: page,
    };
  }
  if (choice.kind === "page") {
    const page = (await readPages()).find((entry) => entry.id === choice.id);
    if (!page || !canViewPage(ctx.user, ctx.directory, page))
      return { error: "Those meeting notes no longer exist" };
    if (page.keeper !== circleId)
      return { error: `Choose a meeting of ${circleName} — the circle the proposal is to` };
    const date = meetingDateOf(page);
    if (!date) return { error: "Those notes aren't a meeting's — give them a meeting date first" };
    if (date > today) return { error: "That meeting hasn't happened yet" };
    const people = page.present?.length ? page.present : present;
    if (!people?.length) return { error: "Say who was at the meeting" };
    return {
      meeting: {
        kind: "page",
        id: page.id,
        title: page.title,
        date,
        circleId: page.keeper,
        href: `/wiki/${page.slug}`,
      },
      present: people,
      notes: page,
    };
  }
  const doc = (await listDocuments()).find((entry) => entry.id === choice.id);
  if (!doc) return { error: "Those minutes no longer exist" };
  if (doc.circleId !== circleId)
    return { error: `Choose a meeting of ${circleName} — the circle the proposal is to` };
  if (!doc.meetingDate) return { error: "Those minutes don't say when the meeting was" };
  if (doc.meetingDate > today) return { error: "That meeting hasn't happened yet" };
  if (!present?.length) return { error: "Say who was at the meeting" };
  return {
    meeting: {
      kind: "file",
      id: doc.id,
      title: doc.title,
      date: doc.meetingDate,
      circleId: doc.circleId,
      href: `/api/documents/${doc.id}/file`,
    },
    present,
  };
}

/** Who was at the meeting, saved to its notes when they didn't say (and the recorder can edit them). */
export async function savePresent(
  meeting: { present: NamedPerson[]; notes?: WikiPage },
  ctx: ProposalSession
) {
  const notes = meeting.notes;
  if (!notes || notes.present?.length || !meeting.present.length) return;
  if (!canEditPage(ctx.user, ctx.directory, notes)) return;
  await updatePage(notes.slug, ctx.actor, { present: meeting.present });
}

/** Check the documents a proposal is about exist (and, for pages, that you can see them). */
export async function checkDocuments(refs: DocumentRef[], ctx: ProposalSession) {
  if (!refs.length) return null;
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  const missing = refs.some((ref) =>
    ref.kind === "page"
      ? !pages.some((page) => page.id === ref.id && canViewPage(ctx.user, ctx.directory, page))
      : !documents.some((doc) => doc.id === ref.id)
  );
  return missing ? problem("One of those documents no longer exists", 404) : null;
}

/** The versions of a proposal's documents now (a page's last save, a file's version number). */
export function documentVersions(
  refs: DocumentRef[],
  pages: WikiPage[],
  documents: DocumentRecord[]
): (DocumentRef & { version: string })[] {
  return refs.flatMap((ref) => {
    if (ref.kind === "page") {
      const page = pages.find((entry) => entry.id === ref.id);
      return page ? [{ ...ref, version: page.updatedAt }] : [];
    }
    const doc = documents.find((entry) => entry.id === ref.id);
    return doc ? [{ ...ref, version: String(currentVersion(doc).number) }] : [];
  });
}

/** Who hears about a circle's proposals: its members (everyone, for Community). */
async function audienceOf(directory: DirectoryDocument, circleId: string) {
  if (isCommunity(circleId)) return undefined;
  const members = memberIdsOf(directory, circleId);
  return userIdsForPeople(members === "everyone" ? [] : Array.from(members));
}

/** A new proposal: the circle's members hear (everyone, for Community's). */
export async function announceProposal(proposal: Proposal, ctx: ProposalSession) {
  const circleName = circleNameOf(ctx.directory, proposal.circleId);
  const only = await audienceOf(ctx.directory, proposal.circleId);
  await notify({
    topic: "proposals",
    title: `Proposed to ${circleName}: ${proposal.title}`,
    body: `${proposal.proposedBy.name}${
      proposal.decideOn ? ` · to decide ${shortDate(proposal.decideOn, true)}` : ""
    }${proposal.body ? ` — ${excerpt(proposal.body)}` : ""}`,
    url: `/proposals/${proposal.id}`,
    tag: `proposal-${proposal.id}`,
    exceptUserId: ctx.user.id,
    ...(only ? { onlyUserIds: only } : {}),
  });
}

/** Consent recorded: whoever proposed it and the circle's members hear (everyone, for Community's). */
export async function announceConsent(proposal: Proposal, ctx: ProposalSession) {
  if (!proposal.consent) return;
  const circleName = circleNameOf(ctx.directory, proposal.circleId);
  const only = await audienceOf(ctx.directory, proposal.circleId);
  await notify({
    topic: "proposals",
    title: `${circleName} consented: ${proposal.title}`,
    body: `At ${proposal.consent.meeting.title} (${shortDate(
      proposal.consent.meeting.date,
      true
    )})`,
    url: `/proposals/${proposal.id}`,
    tag: `proposal-${proposal.id}`,
    exceptUserId: ctx.user.id,
    ...(only ? { onlyUserIds: Array.from(new Set([...only, proposal.proposedBy.userId])) } : {}),
  });
}
