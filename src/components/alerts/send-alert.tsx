"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  MAX_ALERT,
  audienceLabel,
  type AlertAudience,
  type AlertRecord,
} from "@/lib/alerts/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Pill } from "@/components/ui/pill";
import { SegmentedControl } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { ErrorCard, Loading } from "@/components/ui/status";
import { timeAgo } from "@/lib/time";

/**
 * Sending an alert (the Alert module's button, and the menu under your name): a short
 * message, to the circle's members or to everyone at CVC, sent only after a
 * confirmation that says how many people it will reach — each by a
 * notification and an email, unless they've turned safety alerts off.
 */

export type AlertsState = {
  alerts: AlertRecord[];
  canSend: boolean;
  audience: Record<AlertAudience, number>;
};

/** A circle's recent alerts, from the API. */
export const alertsQuery = (circleId: string) => ({
  queryKey: ["alerts", circleId],
  queryFn: () => apiFetch<AlertsState>(`/api/circles/${circleId}/alerts`),
});

const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

/** The button that opens the dialog: red, and big enough to find in a hurry. */
export function SendAlertButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="destructive"
      size="lg"
      className="w-full gap-2 sm:w-auto sm:self-start"
      onClick={onClick}
      data-send-alert
    >
      <Siren className="h-5 w-5" aria-hidden /> Send an alert
    </Button>
  );
}

export function SendAlertDialog({
  circleId,
  circleName,
  audience,
  onClose,
}: {
  circleId: string;
  circleName: string;
  audience: AlertsState["audience"];
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [to, setTo] = useState<AlertAudience>("circle");
  const count = audience[to];
  const send = useMutation({
    mutationFn: () =>
      apiFetch<{ alert: AlertRecord }>(`/api/circles/${circleId}/alerts`, {
        method: "POST",
        body: JSON.stringify({ message: message.trim(), audience: to }),
      }),
    onSuccess: ({ alert }) => {
      void queryClient.invalidateQueries({ queryKey: ["alerts", circleId] });
      toast({ title: `Alert sent to ${people(alert.people)}` });
      onClose();
    },
    onError: (error: Error) =>
      toast({ title: "The alert wasn't sent", description: error.message, variant: "destructive" }),
  });
  const submit = async () => {
    if (!message.trim() || !count || send.isPending) return;
    const sure = await confirm({
      title:
        to === "everyone"
          ? `Alert everyone at CVC (${people(count)})?`
          : `Alert ${circleName} (${people(count)})?`,
      body: "Each gets a notification on their devices and an email, unless they've turned safety alerts off. An alert can't be taken back.",
      confirmLabel: "Send alert",
      destructive: true,
    });
    if (sure) send.mutate();
  };
  return (
    <Dialog
      title="Send an alert"
      icon={<Siren className="h-5 w-5 text-destructive" aria-hidden />}
      onClose={send.isPending ? () => undefined : onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        data-alert-form
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          What&apos;s happening
          <Textarea
            autoFocus
            required
            rows={4}
            maxLength={MAX_ALERT}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What's happening, where, and what people should do"
            className="bg-white"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Who to alert</span>
          <SegmentedControl
            label="Who to alert"
            value={to}
            onChange={setTo}
            options={[
              { value: "circle", label: circleName },
              { value: "everyone", label: "Everyone at CVC" },
            ]}
          />
          <p className="text-xs text-muted">
            {count
              ? `${people(count)}, by notification and email.`
              : `${circleName} has no members yet.`}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={send.isPending || !message.trim() || !count}
          >
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** One alert: what it said, who it went to, who sent it and when. */
export function AlertItem({ alert, circleName }: { alert: AlertRecord; circleName: string }) {
  return (
    <li className="flex flex-col gap-1" data-alert={alert.id}>
      <p className="whitespace-pre-line break-words text-sm text-foreground">{alert.message}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <Pill tone={alert.audience === "everyone" ? "destructive" : "outline"} size="xs">
          To {audienceLabel(alert.audience, circleName)}
        </Pill>
        <span>
          {alert.by.name} · {timeAgo(alert.at)}
        </span>
      </p>
    </li>
  );
}

/** The send dialog for a circle, from anywhere (the menu under your name): it loads who it can reach first. */
export function SendAlertFrom({
  circle,
  onClose,
}: {
  circle: { id: string; name: string };
  onClose: () => void;
}) {
  const { data, error } = useQuery(alertsQuery(circle.id));
  if (data)
    return (
      <SendAlertDialog
        circleId={circle.id}
        circleName={circle.name}
        audience={data.audience}
        onClose={onClose}
      />
    );
  return (
    <Dialog
      title="Send an alert"
      icon={<Siren className="h-5 w-5 text-destructive" aria-hidden />}
      onClose={onClose}
    >
      {error ? <ErrorCard error={error} fallback="Alerts can't be sent just now." /> : <Loading />}
    </Dialog>
  );
}
