"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Siren } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { ModuleToggle } from "@/components/circles/circle-modules";
import {
  AlertItem,
  SendAlertButton,
  SendAlertDialog,
  alertsQuery,
} from "@/components/alerts/send-alert";

const SHOWN = 5;

/**
 * A circle's Alert module (the Safety Crew's): **Send an alert** — to the
 * circle's members, or to everyone at CVC — and the alerts sent, newest
 * first, each with who sent it. Any resident can send one; only admins put
 * the module on a page.
 */
export function AlertModule({
  circleId,
  circleName,
  title,
}: {
  circleId: string;
  circleName: string;
  title: string;
}) {
  const { data, isLoading, error } = useQuery(alertsQuery(circleId));
  const [sending, setSending] = useState(false);
  const [all, setAll] = useState(false);
  const alerts = data?.alerts ?? [];
  return (
    <Card className="flex flex-col gap-4" data-alert-module>
      <SectionHeading icon={Siren} toggle={<ModuleToggle />}>
        {title}
      </SectionHeading>
      <p className="text-sm text-foreground-light">
        Alert {circleName} — or everyone at CVC — by notification and email.
      </p>
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorCard error={error} fallback="The alerts couldn't be loaded." />
      ) : (
        <>
          {data.canSend ? <SendAlertButton onClick={() => setSending(true)} /> : null}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">Recent alerts</h3>
            {alerts.length ? (
              <ul className="flex flex-col gap-3 divide-y divide-border [&>li+li]:pt-3">
                {(all ? alerts : alerts.slice(0, SHOWN)).map((alert) => (
                  <AlertItem key={alert.id} alert={alert} circleName={circleName} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No alerts yet.</p>
            )}
            {alerts.length > SHOWN && !all ? (
              <button
                type="button"
                className="self-start text-sm font-medium text-secondary-foreground underline underline-offset-4"
                onClick={() => setAll(true)}
              >
                Show all {alerts.length}
              </button>
            ) : null}
          </div>
          {sending ? (
            <SendAlertDialog
              circleId={circleId}
              circleName={circleName}
              audience={data.audience}
              onClose={() => setSending(false)}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
