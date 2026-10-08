"use client";

import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, BookOpen, FileText, Handshake } from "lucide-react";
import type { MeetingOption, ProposalView } from "@/lib/proposals/shared";
import { PROPOSAL_DIRECTIVE } from "@/lib/proposals/shared";
import { shortDate } from "@/lib/time";
import { ActionLink } from "@/components/ui/action-link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { ConsentDialog } from "./consent-dialog";
import { ProposalFormDialog } from "./proposal-form";
import { ProposalConsentRecord, ProposalStatusPill } from "./proposal-bits";
import {
  changeProposal,
  deleteProposal,
  proposalQuery,
  recordConsent,
  useProposalsChanged,
  withdrawConsent,
  type ConsentDraft,
  type ProposalDraft,
} from "./data";

/**
 * A proposal as a card — held in a document (`::proposal{id="…"}`) or on
 * its own page — and what can be done with it: in the notes of one of its
 * circle's meetings, **Consent at this meeting** (who was there comes from
 * the notes); elsewhere, **Record consent** at a meeting chosen then; and
 * change, withdraw, propose again, withdraw consent, or delete, for those
 * who may.
 */

/** The meeting whose notes are being shown, if they're a meeting's: proposals in them can be consented there. */
export const ProposalHostContext = createContext<{
  meeting: MeetingOption;
  circleId: string;
} | null>(null);

/** The actions a reader may take on a proposal. */
export function ProposalActions({
  proposal,
  onDeleted,
}: {
  proposal: ProposalView;
  onDeleted?: () => void;
}) {
  const host = useContext(ProposalHostContext);
  const confirm = useConfirm();
  const { toast } = useToast();
  const changed = useProposalsChanged();
  const [dialog, setDialog] = useState<"consent" | "edit" | null>(null);
  const atMeeting = host && host.circleId === proposal.circleId ? host.meeting : undefined;
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });

  const consent = useMutation({
    mutationFn: (draft: ConsentDraft) => recordConsent(proposal.id, draft),
    onSuccess: () => {
      setDialog(null);
      toast({ title: `Consent recorded for ${proposal.circleName}` });
      changed();
    },
    onError: fail("Could not record consent"),
  });
  const edit = useMutation({
    mutationFn: (draft: ProposalDraft) => changeProposal(proposal.id, draft),
    onSuccess: () => {
      setDialog(null);
      toast({ title: "Proposal saved" });
      changed();
    },
    onError: fail("Could not save the proposal"),
  });
  const status = useMutation({
    mutationFn: (next: "proposed" | "withdrawn") => changeProposal(proposal.id, { status: next }),
    onSuccess: (_result, next) => {
      toast({
        title: next === "withdrawn" ? "Proposal withdrawn" : `Proposed to ${proposal.circleName}`,
      });
      changed();
    },
    onError: fail("Could not change that"),
  });
  const unconsent = useMutation({
    mutationFn: () => withdrawConsent(proposal.id),
    onSuccess: () => {
      toast({ title: "Consent withdrawn" });
      changed();
    },
    onError: fail("Could not withdraw consent"),
  });
  const remove = useMutation({
    mutationFn: () => deleteProposal(proposal.id),
    onSuccess: () => {
      toast({ title: "Proposal deleted" });
      changed();
      onDeleted?.();
    },
    onError: fail("Could not delete it"),
  });

  const open = proposal.status === "proposed";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" data-proposal-actions>
      {open && proposal.canConsent ? (
        atMeeting ? (
          <Button size="sm" className="gap-1.5" onClick={() => setDialog("consent")}>
            <BadgeCheck className="h-4 w-4" /> Consent at this meeting
          </Button>
        ) : (
          <ActionLink onClick={() => setDialog("consent")}>Record consent</ActionLink>
        )
      ) : null}
      {proposal.status !== "consented" && proposal.canEdit ? (
        <ActionLink onClick={() => setDialog("edit")}>Edit</ActionLink>
      ) : null}
      {open && proposal.canEdit ? (
        <ActionLink
          danger
          disabled={status.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Withdraw “${proposal.title}”?`,
                body: "It's no longer waiting for consent. It can be proposed again later.",
                confirmLabel: "Withdraw",
              })
            )
              status.mutate("withdrawn");
          }}
        >
          Withdraw
        </ActionLink>
      ) : null}
      {proposal.status === "withdrawn" && proposal.canEdit ? (
        <ActionLink disabled={status.isPending} onClick={() => status.mutate("proposed")}>
          Propose again
        </ActionLink>
      ) : null}
      {proposal.status === "consented" && proposal.canConsent ? (
        <ActionLink
          danger
          disabled={unconsent.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Withdraw the record that ${proposal.circleName} consented to “${proposal.title}”?`,
                body: "For a record made by mistake: the proposal waits for consent again.",
                confirmLabel: "Withdraw consent",
              })
            )
              unconsent.mutate();
          }}
        >
          Withdraw consent
        </ActionLink>
      ) : null}
      {proposal.status !== "consented" && proposal.canEdit ? (
        <ActionLink
          danger
          disabled={remove.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Delete “${proposal.title}”?`,
                body: "Pages that hold it show it's gone. This can't be undone.",
                destructive: true,
              })
            )
              remove.mutate();
          }}
        >
          Delete
        </ActionLink>
      ) : null}
      {dialog === "consent" ? (
        <ConsentDialog
          circleId={proposal.circleId}
          circleName={proposal.circleName}
          title={proposal.title}
          meeting={atMeeting}
          saving={consent.isPending}
          onSubmit={(draft) => consent.mutate(draft)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "edit" ? (
        <ProposalFormDialog
          heading="Change the proposal"
          initial={{
            circleId: proposal.circleId,
            title: proposal.title,
            body: proposal.body,
            decideOn: proposal.decideOn,
          }}
          initialDocuments={proposal.documentsShown.map(({ kind, id, title }) => ({
            kind,
            id,
            title,
          }))}
          circleName={proposal.circleName}
          submitLabel="Save"
          saving={edit.isPending}
          onSubmit={(draft) => edit.mutate(draft)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/** The documents a proposal is about, as links. */
export function ProposalDocuments({ proposal }: { proposal: ProposalView }) {
  if (!proposal.documentsShown.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted">About</p>
      <ul className="flex flex-col gap-1">
        {proposal.documentsShown.map((doc) => (
          <li key={`${doc.kind}:${doc.id}`} className="flex items-center gap-1.5 text-sm">
            {doc.kind === "page" ? (
              <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            )}
            {doc.href ? (
              <Link
                href={doc.href}
                className="min-w-0 break-words font-medium text-foreground hover:underline"
                {...(doc.kind === "file" ? { target: "_blank", rel: "noopener" } : {})}
              >
                {doc.title}
              </Link>
            ) : (
              <span className="text-muted">{doc.title}</span>
            )}
            {doc.circleName && doc.circleName !== proposal.circleName ? (
              <span className="text-xs text-muted">· {doc.circleName}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Who proposed it, when, and to which circle. */
export function ProposalByline({ proposal }: { proposal: ProposalView }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
      <Handshake className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span>
        Proposal to <span className="font-medium text-foreground">{proposal.circleName}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        by {proposal.proposedBy.name}, {shortDate(proposal.createdAt.slice(0, 10), true)}
      </span>
    </p>
  );
}

/** A proposal held in a document. */
export function ProposalBlock({ proposalId }: { proposalId: string }) {
  const { data, isLoading, error } = useQuery(proposalQuery(proposalId));
  const pages = useWikiPages().data?.pages;
  if (isLoading)
    return <div className="my-2 h-28 animate-pulse rounded-xl bg-accent/40" aria-hidden />;
  const proposal = data?.proposal;
  if (error || !proposal)
    return (
      <p className="my-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">
        This proposal is no longer available.
      </p>
    );
  const body = proposal.body.replace(PROPOSAL_DIRECTIVE, "").trim();
  return (
    <section
      className="not-prose my-2 flex flex-col gap-3 rounded-xl border border-border border-l-4 border-l-primary bg-white/80 p-4"
      data-proposal-block={proposal.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProposalByline proposal={proposal} />
        <ProposalStatusPill
          status={proposal.status}
          decideOn={proposal.decideOn}
          consentDate={proposal.consent?.meeting.date}
        />
      </div>
      <Link
        href={`/proposals/${proposal.id}`}
        className="font-display text-lg font-semibold leading-snug text-foreground hover:underline"
      >
        {proposal.title}
      </Link>
      {body ? (
        <div className="text-sm">
          <WikiMarkdown source={body} circleId={proposal.circleId} pages={pages} />
        </div>
      ) : null}
      <ProposalDocuments proposal={proposal} />
      {proposal.consent ? (
        <ProposalConsentRecord consent={proposal.consent} circleName={proposal.circleName} />
      ) : null}
      <ProposalActions proposal={proposal} />
    </section>
  );
}
