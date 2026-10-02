"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, CircleDashed, History } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage } from "@/lib/wiki/store";
import { consentState } from "@/lib/wiki/consent";
import { shortDate, todayInVermont } from "@/lib/time";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ActionLink } from "@/components/ui/action-link";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";

/** Where a page stands with its parent circle: consented (and when), changed since, or not consented. */
export function ConsentPill({ page }: { page: Pick<WikiPage, "consent" | "updatedAt"> }) {
  const state = consentState(page);
  if (state === "consented" && page.consent)
    return (
      <Pill
        tone="pine"
        title={`Consented ${shortDate(page.consent.date, true)} · recorded by ${
          page.consent.recordedBy.name
        }`}
        data-consent="consented"
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented{" "}
        {shortDate(page.consent.date, true)}
      </Pill>
    );
  if (state === "changed" && page.consent)
    return (
      <Pill
        tone="amber"
        title={`The version consented ${shortDate(page.consent.date, true)} has been edited since`}
        data-consent="changed"
      >
        <History className="h-3.5 w-3.5" aria-hidden /> Changed since consent on{" "}
        {shortDate(page.consent.date, true)}
      </Pill>
    );
  return (
    <Pill tone="outline" className="font-normal" data-consent="none">
      <CircleDashed className="h-3.5 w-3.5" aria-hidden /> Not consented
    </Pill>
  );
}

/** Record, renew, or withdraw the parent circle's consent (those who manage the page). */
export function ConsentControls({
  page,
  slug,
  circleName,
  onSaved,
}: {
  page: WikiPage;
  slug: string;
  circleName: string;
  onSaved: (page: WikiPage) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [recording, setRecording] = useState(false);
  const [date, setDate] = useState(todayInVermont());
  const state = consentState(page);
  const save = useMutation({
    mutationFn: (consent: { date: string } | null) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ consent }),
      }),
    onSuccess: ({ page: updated }, consent) => {
      setRecording(false);
      toast({ title: consent ? "Consent recorded" : "Consent withdrawn" });
      onSaved(updated);
    },
    onError: (err: Error) =>
      toast({ title: "Could not change that", description: err.message, variant: "destructive" }),
  });
  return (
    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
      {state !== "consented" ? (
        <ActionLink onClick={() => setRecording(true)}>
          {state === "changed" ? "Consent to this version" : "Record consent"}
        </ActionLink>
      ) : null}
      {state ? (
        <ActionLink
          danger
          disabled={save.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Withdraw the record that ${circleName} consented to “${page.title}”?`,
                confirmLabel: "Withdraw",
              })
            )
              save.mutate(null);
          }}
        >
          Withdraw consent
        </ActionLink>
      ) : null}
      {recording ? (
        <Dialog
          title="Record consent"
          icon={<BadgeCheck className="h-5 w-5 text-primary" />}
          onClose={() => setRecording(false)}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (date) save.mutate({ date });
            }}
          >
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {circleName} consented to this page on
              <Input
                type="date"
                value={date}
                max={todayInVermont()}
                onChange={(event) => setDate(event.target.value)}
                className="bg-white"
                required
              />
            </label>
            <p className="text-xs text-muted">
              Consent is to the page as it stands now; if it&apos;s edited again, it shows as
              changed since consent until the circle consents to the new version.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRecording(false)}>
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
