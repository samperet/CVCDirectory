"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, CircleDashed, History, Hourglass } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage } from "@/lib/wiki/store";
import { changedSinceProposed, consentState, pageStage } from "@/lib/wiki/consent";
import { shortDate } from "@/lib/time";
import { Pill } from "@/components/ui/pill";
import { ActionLink } from "@/components/ui/action-link";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { consentSummary } from "@/components/circles/consent-record";
import { ConsentDialog } from "@/components/proposals/consent-dialog";
import { ProposalFormDialog } from "@/components/proposals/proposal-form";
import {
  changeProposal,
  createProposal,
  recordConsent,
  retakeSnapshot,
  useProposalsChanged,
  withdrawConsent,
  type ConsentDraft,
  type ProposalDraft,
} from "@/components/proposals/data";

/**
 * A page's stage with its parent circle, as a pill: a draft (and, if it was
 * consented before, since when it has changed), proposed (a proposed change,
 * for a consented page; the day it's to be decided), or consented (when).
 * The stage comes from the proposals about the page (`lib/proposals`); a
 * record from before proposals shows the same way.
 */
export function StagePill({
  page,
}: {
  page: Pick<WikiPage, "consent" | "proposal" | "updatedAt">;
}) {
  const stage = pageStage(page);
  const changed = consentState(page) === "changed";
  if (stage === "consented" && page.consent)
    return (
      <Pill
        tone="pine"
        title={consentSummary(page.consent)}
        data-stage="consented"
        data-consent="consented"
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented{" "}
        {shortDate(page.consent.date, true)}
      </Pill>
    );
  if (stage === "proposed" && page.proposal) {
    const decideOn = page.proposal.decideOn;
    return (
      <Pill
        tone="sun"
        title={`Proposed by ${page.proposal.by.name} ${shortDate(
          page.proposal.at,
          true
        )}; waiting for the circle's consent${
          changed && page.consent
            ? ` (the version consented ${shortDate(page.consent.date, true)} has been changed)`
            : ""
        }`}
        data-stage="proposed"
        data-consent={changed ? "changed" : "none"}
      >
        <Hourglass className="h-3.5 w-3.5" aria-hidden /> {changed ? "Proposed change" : "Proposed"}
        {decideOn ? ` · to decide ${shortDate(decideOn, true)}` : ""}
      </Pill>
    );
  }
  if (changed && page.consent)
    return (
      <Pill
        tone="amber"
        title={`A draft: the version consented ${shortDate(
          page.consent.date,
          true
        )} has been edited since`}
        data-stage="draft"
        data-consent="changed"
      >
        <History className="h-3.5 w-3.5" aria-hidden /> Draft · changed since consent on{" "}
        {shortDate(page.consent.date, true)}
      </Pill>
    );
  return (
    <Pill tone="outline" className="font-normal" data-stage="draft" data-consent="none">
      <CircleDashed className="h-3.5 w-3.5" aria-hidden /> Draft
    </Pill>
  );
}

/** For a proposed page edited since: what's proposed is the page as it was (the proposal's snapshot). */
export function EditedSinceProposed({
  page,
}: {
  page: Pick<WikiPage, "consent" | "proposal" | "updatedAt">;
}) {
  if (pageStage(page) !== "proposed" || !page.proposal?.proposalId || !changedSinceProposed(page))
    return null;
  return (
    <Link
      href={`/proposals/${page.proposal.proposalId}`}
      className="text-xs font-medium text-[#7a5200] underline-offset-2 hover:underline"
      title="What's proposed is the page as it was when it was proposed: the proposal's snapshot of it"
      data-edited-since-proposed
    >
      Edited since it was proposed
    </Link>
  );
}

/** Where the page's stage comes from: a link to its proposal, or — for consent — the meeting. */
export function StageSource({ page }: { page: Pick<WikiPage, "consent" | "proposal"> }) {
  const proposalId = page.proposal?.proposalId ?? page.consent?.proposalId;
  if (!proposalId) return null;
  return (
    <Link
      href={`/proposals/${proposalId}`}
      className="text-xs font-medium text-secondary-foreground underline-offset-2 hover:underline"
      data-stage-proposal
    >
      {page.proposal?.proposalId
        ? `Proposal: ${page.proposal.title ?? "see it"}`
        : "The proposal and its consent"}
    </Link>
  );
}

/**
 * Moving a page between stages, through proposals. Its editors **propose
 * it for consent** (a proposal about the page, to its circle); the circle's
 * members and the Board **record consent** at a meeting (to the open
 * proposal about it, or — when there's none — a proposal made for it there
 * and then). Withdrawing a proposal, or consent recorded by mistake, acts
 * on the proposal; records from before proposals are withdrawn on the page.
 * A page edited since it was proposed says so — what's proposed is its
 * snapshot — and the circle's members can **propose this version** instead.
 */
export function StageControls({
  page,
  slug,
  circleName,
  canEdit,
  canConsent,
  onSaved,
}: {
  page: WikiPage;
  slug: string;
  circleName: string;
  canEdit: boolean;
  canConsent: boolean;
  onSaved: (page: WikiPage) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const changed = useProposalsChanged();
  const [dialog, setDialog] = useState<"propose" | "consent" | null>(null);
  const stage = pageStage(page);
  const state = consentState(page);
  const openProposal = page.proposal?.proposalId ?? null;
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const done = (title: string) => {
    setDialog(null);
    toast({ title });
    changed();
  };

  const propose = useMutation({
    mutationFn: (draft: ProposalDraft) => createProposal(draft),
    onSuccess: ({ proposal }) => done(`Proposed to ${proposal.circleName}`),
    onError: fail("Could not propose it"),
  });
  const consent = useMutation({
    mutationFn: (draft: ConsentDraft) =>
      openProposal
        ? recordConsent(openProposal, draft)
        : createProposal({
            circleId: page.keeper,
            title: page.title,
            body: "",
            documents: [{ kind: "page", id: page.id }],
            decideOn: null,
            consent: draft,
          }),
    onSuccess: () => done("Consent recorded"),
    onError: fail("Could not record consent"),
  });
  // Records from before proposals are withdrawn on the page itself.
  const legacy = useMutation({
    mutationFn: (change: { consent: null } | { proposal: null }) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      }),
    onSuccess: ({ page: updated }, change) => {
      toast({ title: "consent" in change ? "Consent withdrawn" : "Proposal withdrawn" });
      onSaved(updated);
    },
    onError: fail("Could not change that"),
  });
  const retake = useMutation({
    mutationFn: () => retakeSnapshot(openProposal!, { kind: "page", id: page.id }),
    onSuccess: () => done("This version is proposed now"),
    onError: fail("Could not change that"),
  });
  const withdraw = useMutation({
    mutationFn: (what: "proposal" | "consent") =>
      what === "proposal"
        ? changeProposal(page.proposal!.proposalId!, { status: "withdrawn" })
        : withdrawConsent(page.consent!.proposalId!),
    onSuccess: (_result, what) =>
      done(what === "proposal" ? "Proposal withdrawn" : "Consent withdrawn"),
    onError: fail("Could not change that"),
  });

  const ask = async (what: "proposal" | "consent") => {
    const ok = await confirm(
      what === "proposal"
        ? {
            title: `Withdraw the proposal of “${page.title}”?`,
            body: "It goes back to being a draft. You can propose it again later.",
            confirmLabel: "Withdraw",
          }
        : {
            title: `Withdraw the record that ${circleName} consented to “${page.title}”?`,
            body: "For a record made by mistake.",
            confirmLabel: "Withdraw",
          }
    );
    if (!ok) return;
    const fromProposal =
      what === "proposal" ? !!page.proposal?.proposalId : !!page.consent?.proposalId;
    if (fromProposal) withdraw.mutate(what);
    else legacy.mutate(what === "proposal" ? { proposal: null } : { consent: null });
  };
  const busy = legacy.isPending || withdraw.isPending || retake.isPending;
  const editedSince = stage === "proposed" && !!openProposal && changedSinceProposed(page);
  return (
    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
      <StageSource page={page} />
      {editedSince && canConsent ? (
        <ActionLink disabled={busy} onClick={() => retake.mutate()}>
          Propose this version
        </ActionLink>
      ) : null}
      {stage === "draft" && canEdit ? (
        <ActionLink onClick={() => setDialog("propose")}>Propose for consent</ActionLink>
      ) : null}
      {stage !== "consented" && canConsent ? (
        <ActionLink onClick={() => setDialog("consent")}>
          {state === "changed" ? "Consent to this version" : "Record consent"}
        </ActionLink>
      ) : null}
      {stage === "proposed" && canEdit ? (
        <ActionLink danger disabled={busy} onClick={() => void ask("proposal")}>
          Withdraw proposal
        </ActionLink>
      ) : null}
      {state && canConsent ? (
        <ActionLink danger disabled={busy} onClick={() => void ask("consent")}>
          Withdraw consent
        </ActionLink>
      ) : null}
      {dialog === "propose" ? (
        <ProposalFormDialog
          heading="Propose for consent"
          initial={{
            circleId: page.keeper,
            title: state === "changed" ? `Changes to ${page.title}` : page.title,
            body: "",
            decideOn: null,
          }}
          initialDocuments={[{ kind: "page", id: page.id, title: page.title }]}
          circleName={circleName}
          submitLabel="Propose"
          saving={propose.isPending}
          onSubmit={(draft) => propose.mutate(draft)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "consent" ? (
        <ConsentDialog
          proposalId={openProposal ?? undefined}
          preferCurrent={state === "changed"}
          circleId={page.proposal?.circleId ?? page.keeper}
          circleName={circleName}
          title={page.proposal?.title ?? page.title}
          saving={consent.isPending}
          onSubmit={(draft) => consent.mutate(draft)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </span>
  );
}
