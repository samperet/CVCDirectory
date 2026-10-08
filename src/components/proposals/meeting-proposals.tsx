"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Handshake } from "lucide-react";
import type { MeetingOption, ProposalListing } from "@/lib/proposals/shared";
import { shortDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ConsentDialog } from "./consent-dialog";
import { proposalsQuery, recordConsent, useProposalsChanged, type ConsentDraft } from "./data";

/**
 * In a meeting's notes: the proposals to the meeting's circle — those
 * consented at this meeting, and those still waiting for consent, each with
 * a **Consent** button for the circle's members and the Board. Consenting
 * here records this meeting, who was there (from the notes — asked for if
 * they don't say yet), the circle, and who recorded it.
 */
export function MeetingProposals({
  meeting,
  circleId,
  circleName,
  canConsent,
}: {
  meeting: MeetingOption;
  circleId: string;
  circleName: string;
  canConsent: boolean;
}) {
  const { toast } = useToast();
  const changed = useProposalsChanged();
  const { data } = useQuery(proposalsQuery({ circle: circleId }));
  const [consenting, setConsenting] = useState<ProposalListing | null>(null);
  const consent = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: ConsentDraft }) => recordConsent(id, draft),
    onSuccess: () => {
      setConsenting(null);
      toast({ title: `Consent recorded for ${circleName}` });
      changed();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not record consent",
        description: err.message,
        variant: "destructive",
      }),
  });
  const proposals = data?.proposals ?? [];
  const decided = proposals.filter(
    (proposal) =>
      proposal.consent?.meeting.kind === "page" && proposal.consent.meeting.id === meeting.id
  );
  const waiting = proposals.filter((proposal) => proposal.status === "proposed");
  if (!decided.length && !waiting.length) return null;
  return (
    <section
      className="flex w-full flex-col gap-3 rounded-xl border border-border bg-accent/30 p-4 text-left"
      aria-label="Proposals at this meeting"
      data-meeting-proposals
    >
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Handshake className="h-4 w-4 text-primary" aria-hidden /> Proposals
      </h2>
      {decided.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted">Consented at this meeting</p>
          <ul className="flex flex-col gap-1">
            {decided.map((proposal) => (
              <li key={proposal.id} className="flex items-start gap-1.5 text-sm">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden />
                <Link
                  href={`/proposals/${proposal.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {proposal.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {waiting.length ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted">Waiting for {circleName}&apos;s consent</p>
          <ul className="flex flex-col divide-y divide-border/70">
            {waiting.map((proposal) => (
              <li
                key={proposal.id}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                data-waiting-proposal={proposal.id}
              >
                <span className="min-w-0">
                  <Link
                    href={`/proposals/${proposal.id}`}
                    className="break-words text-sm font-medium text-foreground hover:underline"
                  >
                    {proposal.title}
                  </Link>
                  <span className="block text-xs text-muted">
                    by {proposal.proposedBy}
                    {proposal.decideOn ? ` · to decide ${shortDate(proposal.decideOn, true)}` : ""}
                  </span>
                </span>
                {canConsent ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setConsenting(proposal)}
                  >
                    <BadgeCheck className="h-4 w-4" /> Consent
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {consenting ? (
        <ConsentDialog
          circleId={circleId}
          circleName={circleName}
          title={consenting.title}
          meeting={meeting}
          saving={consent.isPending}
          onSubmit={(draft) => consent.mutate({ id: consenting.id, draft })}
          onClose={() => setConsenting(null)}
        />
      ) : null}
    </section>
  );
}
