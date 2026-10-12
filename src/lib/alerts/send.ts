import { notify } from "@/lib/push/notify";
import type { Circle } from "@/lib/circles/types";
import type { AlertRecord } from "./shared";

/**
 * Send an alert: a push notification and an email (topic `alerts`, on by
 * default, which each resident can turn off) to the circle's members —
 * emailed even if they've never signed in — or to everyone at CVC. Not to
 * the sender. Text messages, if CVC ever has them, would be sent from here
 * too (residents' phone numbers are in the directory). Never throws.
 */
export function sendAlert(circle: Pick<Circle, "id" | "name">, alert: AlertRecord, to: string[]) {
  return notify({
    topic: "alerts",
    title: `Alert from ${circle.name}`,
    body: `${alert.message} — ${alert.by.name}`,
    url: `/circles/${circle.id}#alert`,
    tag: `alert-${alert.id}`,
    exceptUserId: alert.by.userId,
    ...(alert.audience === "everyone" ? {} : { onlyPersonIds: to }),
  });
}
