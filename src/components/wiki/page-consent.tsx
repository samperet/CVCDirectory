"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, CircleDashed, History, Hourglass, Send } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage } from "@/lib/wiki/store";
import { consentState, pageStage } from "@/lib/wiki/consent";
import { shortDate, todayInVermont } from "@/lib/time";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ActionLink } from "@/components/ui/action-link";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";

/**
 * A page's stage with its parent circle, as a pill: a draft (and, if it was
 * consented before, since when it has changed), proposed (a proposed change,
 * for a consented page; the day it's to be decided), or consented (when).
 * Proposals and consent are only for pages; uploaded files are consented
 * to as they are.
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
        title={`Consented ${shortDate(page.consent.date, true)} · recorded by ${
          page.consent.recordedBy.name
        }`}
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

type StageChange =
  | { consent: { date: string } | null }
  | { proposal: { decideOn: string | null } | null };

/**
 * Moving a page between stages. Its editors propose it to the circle (by a
 * day, if they like) or withdraw the proposal; the circle's members and the
 * Board record consent (which ends the proposal) or withdraw it.
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
  const [dialog, setDialog] = useState<"propose" | "consent" | null>(null);
  const today = todayInVermont();
  const decideOn = page.proposal?.decideOn;
  const [date, setDate] = useState(decideOn && decideOn <= today ? decideOn : today);
  const [decideBy, setDecideBy] = useState("");
  const stage = pageStage(page);
  const state = consentState(page);
  const save = useMutation({
    mutationFn: (change: StageChange) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      }),
    onSuccess: ({ page: updated }, change) => {
      setDialog(null);
      toast({
        title:
          "consent" in change
            ? change.consent
              ? "Consent recorded"
              : "Consent withdrawn"
            : change.proposal
              ? `Proposed to ${circleName}`
              : "Proposal withdrawn",
      });
      onSaved(updated);
    },
    onError: (err: Error) =>
      toast({ title: "Could not change that", description: err.message, variant: "destructive" }),
  });
  const withdraw = async (what: "proposal" | "consent") => {
    const ok = await confirm(
      what === "proposal"
        ? {
            title: `Withdraw the proposal of “${page.title}”?`,
            body: "It goes back to being a draft. You can propose it again later.",
            confirmLabel: "Withdraw",
          }
        : {
            title: `Withdraw the record that ${circleName} consented to “${page.title}”?`,
            confirmLabel: "Withdraw",
          }
    );
    if (ok) save.mutate(what === "proposal" ? { proposal: null } : { consent: null });
  };
  return (
    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
      {stage === "draft" && canEdit ? (
        <ActionLink onClick={() => setDialog("propose")}>Propose for consent</ActionLink>
      ) : null}
      {stage !== "consented" && canConsent ? (
        <ActionLink onClick={() => setDialog("consent")}>
          {state === "changed" ? "Consent to this version" : "Record consent"}
        </ActionLink>
      ) : null}
      {stage === "proposed" && canEdit ? (
        <ActionLink danger disabled={save.isPending} onClick={() => void withdraw("proposal")}>
          Withdraw proposal
        </ActionLink>
      ) : null}
      {state && canConsent ? (
        <ActionLink danger disabled={save.isPending} onClick={() => void withdraw("consent")}>
          Withdraw consent
        </ActionLink>
      ) : null}
      {dialog === "propose" ? (
        <Dialog
          title="Propose for consent"
          icon={<Send className="h-5 w-5 text-primary" />}
          onClose={() => setDialog(null)}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate({ proposal: { decideOn: decideBy || null } });
            }}
          >
            <p className="text-sm text-foreground">
              Put “{page.title}” to {circleName} for consent. It shows as <strong>Proposed</strong>{" "}
              until the circle consents{state === "changed" ? " to the changes" : ""}.
            </p>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              To be decided on (if you know)
              <Input
                type="date"
                value={decideBy}
                min={today}
                onChange={(event) => setDecideBy(event.target.value)}
                className="bg-white"
              />
            </label>
            <p className="text-xs text-muted">
              Anyone with a concern can select the words on the page and add a comment. It can still
              be edited while it&apos;s proposed.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? "Proposing…" : "Propose"}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
      {dialog === "consent" ? (
        <Dialog
          title="Record consent"
          icon={<BadgeCheck className="h-5 w-5 text-primary" />}
          onClose={() => setDialog(null)}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (date) save.mutate({ consent: { date } });
            }}
          >
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {circleName} consented to this page on
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(event) => setDate(event.target.value)}
                className="bg-white"
                required
              />
            </label>
            <p className="text-xs text-muted">
              Consent is to the page as it stands now; if it&apos;s edited again, it becomes a draft
              until the circle consents to the new version.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!date || save.isPending}>
                {save.isPending ? "Saving…" : "Mark consented"}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </span>
  );
}
