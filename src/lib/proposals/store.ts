import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import { namedPeopleSchema } from "@/lib/people";
import type { Actor } from "@/lib/auth/actor";
import {
  sameDocument,
  snapshotOf,
  type DocumentRef,
  type DocumentSnapshot,
  type MeetingRef,
  type PresentPerson,
  type Proposal,
  type ProposalConsent,
  type ProposalPerson,
} from "./shared";

/**
 * Every proposal, in one document (`proposals/proposals.json`), each with
 * where it stands (see `shared.ts`). While it's proposed, it can be changed
 * — its title, text, circle, documents, and the day to decide — withdrawn,
 * or consented at a meeting; a withdrawn one can be proposed again; a
 * consented one stays as it was consented, unless the consent is withdrawn
 * (it's proposed again). Deleting is for proposals that were never
 * consented. Who may do each is decided by the routes (`access.ts`).
 *
 * Each also lists its documents' snapshots (`snapshots`: what each was when
 * attached; the copies themselves are kept by `snapshots.ts`, outside this
 * document). They're added for documents that have none, kept while their
 * document stays on the proposal, and replaced only on request, all while it
 * isn't consented; a consented proposal's stay as they were consented.
 */

const KEY = "proposals/proposals.json";
const MAX_PROPOSALS = 3000;
export const MAX_BODY = 10_000;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-08");
const documentRef = z.object({
  kind: z.enum(["page", "file"]),
  id: z.string().regex(/^[0-9a-f-]{36}$/i, "That isn't a document"),
});

export const proposalInputSchema = z.object({
  circleId: z.string().min(1).max(80),
  title: z
    .string()
    .trim()
    .min(3, "Give the proposal a title")
    .max(160, "Keep the title to 160 characters"),
  body: z
    .string()
    .trim()
    .max(MAX_BODY, `Keep the proposal to ${MAX_BODY.toLocaleString()} characters`)
    .default(""),
  documents: z
    .array(documentRef)
    .max(20, "A proposal can be about 20 documents at most")
    .default([]),
  decideOn: isoDate.nullable().default(null),
});

export const proposalUpdateSchema = z
  .object({
    circleId: proposalInputSchema.shape.circleId.optional(),
    title: proposalInputSchema.shape.title.optional(),
    body: z.string().trim().max(MAX_BODY).optional(),
    documents: z.array(documentRef).max(20).optional(),
    decideOn: isoDate.nullable().optional(),
    /** Withdraw it, or propose a withdrawn one again. */
    status: z.enum(["proposed", "withdrawn"]).optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Nothing to change"
  );

/** Recording consent: the meeting it was given at, and — when the meeting's notes don't say — who was there. */
export const consentInputSchema = z.object({
  meeting: z.union([
    z.object({ kind: z.enum(["page", "file"]), id: z.string().regex(/^[0-9a-f-]{36}$/i) }),
    /** A meeting with no notes yet: new notes are started for it. */
    z.object({ kind: z.literal("new"), date: isoDate }),
  ]),
  present: namedPeopleSchema(200).optional(),
  note: z
    .string()
    .trim()
    .max(500, "Keep the note to 500 characters")
    .optional()
    .transform((value) => value || null),
  /** Consent to the documents as they are now: those changed since their snapshots are snapshotted again first. */
  current: z.boolean().optional(),
});

export type ProposalInput = z.infer<typeof proposalInputSchema>;
export type ProposalUpdate = z.infer<typeof proposalUpdateSchema>;
export type Failure = "not_found" | "full" | "not_open" | "consented" | "not_attached";
export type Result = { ok: true; proposal: Proposal } | { ok: false; reason: Failure };

const personOf = (actor: Pick<Actor, "userId" | "personId" | "name">): ProposalPerson => ({
  userId: actor.userId,
  personId: actor.personId,
  name: actor.name,
});

function normalize(raw: unknown): Proposal[] {
  const proposals = (raw as { proposals?: unknown } | null)?.proposals;
  return Array.isArray(proposals) ? (proposals as Proposal[]) : [];
}

export async function listProposals(): Promise<Proposal[]> {
  return normalize(await readJson(KEY));
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const wanted = id.toLowerCase();
  return (await listProposals()).find((proposal) => proposal.id === wanted) ?? null;
}

/** Change one proposal; `change` returns the new proposal (the same one for no change), or why it can't. */
function mutateOne(id: string, change: (proposal: Proposal) => Proposal | Failure) {
  return mutateJson<Result>(KEY, (raw) => {
    const proposals = normalize(raw);
    const index = proposals.findIndex((proposal) => proposal.id === id.toLowerCase());
    if (index === -1) return { write: false, result: { ok: false, reason: "not_found" } };
    const next = change(proposals[index]);
    if (typeof next === "string") return { write: false, result: { ok: false, reason: next } };
    if (next === proposals[index]) return { write: false, result: { ok: true, proposal: next } };
    const all = [...proposals];
    all[index] = next;
    return { value: { proposals: all }, result: { ok: true, proposal: next } };
  });
}

/** Put a proposal to a circle. */
export function createProposal(
  author: Pick<Actor, "userId" | "personId" | "name">,
  input: ProposalInput
) {
  return mutateJson<Result>(KEY, (raw) => {
    const proposals = normalize(raw);
    if (proposals.length >= MAX_PROPOSALS)
      return { write: false, result: { ok: false, reason: "full" } };
    const now = new Date().toISOString();
    const by = personOf(author);
    const proposal: Proposal = {
      id: randomUUID(),
      circleId: input.circleId,
      title: input.title,
      body: input.body,
      documents: dedupe(input.documents),
      // Taken once it's saved (`snapshots.ts`).
      snapshots: [],
      decideOn: input.decideOn,
      status: "proposed",
      proposedBy: by,
      createdAt: now,
      updatedBy: by,
      updatedAt: now,
      consent: null,
      withdrawn: null,
    };
    return { value: { proposals: [...proposals, proposal] }, result: { ok: true, proposal } };
  });
}

const dedupe = (refs: DocumentRef[]) =>
  refs.filter(
    (ref, index) =>
      refs.findIndex((other) => other.kind === ref.kind && other.id === ref.id) === index
  );

/** Change a proposal while it's proposed (or withdrawn): its details, or withdraw it / propose it again. */
export function updateProposal(
  id: string,
  editor: Pick<Actor, "userId" | "personId" | "name">,
  update: ProposalUpdate
) {
  return mutateOne(id, (proposal) => {
    if (proposal.status === "consented") return "consented";
    const by = personOf(editor);
    const now = new Date().toISOString();
    const status = update.status ?? proposal.status;
    const documents = update.documents !== undefined ? dedupe(update.documents) : null;
    return {
      ...proposal,
      ...(update.circleId !== undefined ? { circleId: update.circleId } : {}),
      ...(update.title !== undefined ? { title: update.title } : {}),
      ...(update.body !== undefined ? { body: update.body } : {}),
      ...(documents
        ? {
            documents,
            // A document taken off takes its snapshot with it.
            snapshots: (proposal.snapshots ?? []).filter((snapshot) =>
              documents.some((ref) => sameDocument(ref, snapshot))
            ),
          }
        : {}),
      ...(update.decideOn !== undefined ? { decideOn: update.decideOn } : {}),
      status,
      withdrawn:
        status === "withdrawn"
          ? proposal.status === "withdrawn"
            ? proposal.withdrawn
            : { by, at: now }
          : null,
      updatedBy: by,
      updatedAt: now,
    };
  });
}

/** Add snapshots for documents the proposal is about and has none of (it isn't consented). */
export function addSnapshots(id: string, snapshots: DocumentSnapshot[]) {
  return mutateOne(id, (proposal) => {
    if (proposal.status === "consented") return "consented";
    const added = snapshots.filter(
      (snapshot, index) =>
        proposal.documents.some((ref) => sameDocument(ref, snapshot)) &&
        !snapshotOf(proposal, snapshot) &&
        snapshots.findIndex((other) => sameDocument(other, snapshot)) === index
    );
    if (!added.length) return proposal;
    return { ...proposal, snapshots: [...(proposal.snapshots ?? []), ...added] };
  });
}

/**
 * Documents' snapshots taken again ("use the current version"), while the
 * proposal isn't consented: each new one takes the place of its document's
 * old one, which comes back in `replaced` (for its copy to be discarded).
 */
export function replaceSnapshots(
  id: string,
  editor: Pick<Actor, "userId" | "personId" | "name">,
  snapshots: DocumentSnapshot[]
) {
  type Replaced =
    | { ok: true; proposal: Proposal; replaced: DocumentSnapshot[] }
    | { ok: false; reason: Failure };
  return mutateJson<Replaced>(KEY, (raw) => {
    const proposals = normalize(raw);
    const index = proposals.findIndex((proposal) => proposal.id === id.toLowerCase());
    const fail = (reason: Failure) => ({
      write: false as const,
      result: { ok: false as const, reason },
    });
    if (index === -1) return fail("not_found");
    const proposal = proposals[index];
    if (proposal.status === "consented") return fail("consented");
    if (
      !snapshots.every((snapshot) => proposal.documents.some((ref) => sameDocument(ref, snapshot)))
    )
      return fail("not_attached");
    const old = proposal.snapshots ?? [];
    const replaced = old.filter((kept) =>
      snapshots.some((snapshot) => sameDocument(snapshot, kept))
    );
    const next: Proposal = {
      ...proposal,
      snapshots: [...old.filter((kept) => !replaced.includes(kept)), ...snapshots],
      updatedBy: personOf(editor),
      updatedAt: new Date().toISOString(),
    };
    const all = [...proposals];
    all[index] = next;
    return { value: { proposals: all }, result: { ok: true, proposal: next, replaced } };
  });
}

/** Record the circle's consent, given at a meeting. Only an open proposal can be consented. */
export function consentToProposal(
  id: string,
  consent: {
    meeting: MeetingRef;
    present: PresentPerson[];
    note: string | null;
    submittedBy: Pick<Actor, "userId" | "personId" | "name">;
    documents: (DocumentRef & { version: string })[];
  }
) {
  return mutateOne(id, (proposal) => {
    if (proposal.status !== "proposed") return "not_open";
    const record: ProposalConsent = {
      meeting: consent.meeting,
      circleId: proposal.circleId,
      present: consent.present,
      note: consent.note,
      submittedBy: personOf(consent.submittedBy),
      submittedAt: new Date().toISOString(),
      documents: consent.documents,
    };
    return { ...proposal, status: "consented", consent: record, withdrawn: null };
  });
}

/** Withdraw the record of consent (recorded by mistake): the proposal is proposed again. */
export function withdrawConsent(id: string, editor: Pick<Actor, "userId" | "personId" | "name">) {
  return mutateOne(id, (proposal) => {
    if (proposal.status !== "consented") return "not_open";
    return {
      ...proposal,
      status: "proposed",
      consent: null,
      updatedBy: personOf(editor),
      updatedAt: new Date().toISOString(),
    };
  });
}

/** Delete a proposal that was never consented (one started by mistake). */
export function deleteProposal(id: string) {
  return mutateJson<Result>(KEY, (raw) => {
    const proposals = normalize(raw);
    const found = proposals.find((proposal) => proposal.id === id.toLowerCase());
    if (!found) return { write: false, result: { ok: false, reason: "not_found" } };
    if (found.status === "consented")
      return { write: false, result: { ok: false, reason: "consented" } };
    return {
      value: { proposals: proposals.filter((proposal) => proposal.id !== found.id) },
      result: { ok: true, proposal: found },
    };
  });
}

/** When a circle is deleted, its open proposals go to the Board (as its documents do). */
export function handOverProposals(fromCircleId: string, toCircleId: string) {
  return mutateJson(KEY, (raw) => {
    const proposals = normalize(raw);
    if (!proposals.some((proposal) => proposal.circleId === fromCircleId))
      return { write: false, result: null };
    return {
      value: {
        proposals: proposals.map((proposal) =>
          proposal.circleId === fromCircleId && proposal.status !== "consented"
            ? { ...proposal, circleId: toCircleId }
            : proposal
        ),
      },
      result: null,
    };
  });
}
