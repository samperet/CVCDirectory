import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, mutateJson, readJson } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";
import { ALERT_AUDIENCES, MAX_ALERT, type AlertAudience, type AlertRecord } from "./shared";

/**
 * A circle's alerts, newest first (`alerts/<circleId>.json`, the last 50).
 * Each records who sent it, to whom, and how many residents that was; one
 * person can send at most one a minute (a second press, or a second tab,
 * isn't a second alert).
 */

const KEEP = 50;
/** One alert a minute from each person. */
export const ALERT_GAP_MS = 60_000;

export const alertInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Say what's happening")
    .max(MAX_ALERT, `Keep an alert to ${MAX_ALERT} characters`),
  audience: z.enum(ALERT_AUDIENCES),
});

const key = (circleId: string) => `alerts/${circleId}.json`;

function normalize(raw: unknown): AlertRecord[] {
  const alerts = (raw as { alerts?: unknown } | null)?.alerts;
  return Array.isArray(alerts) ? (alerts as AlertRecord[]) : [];
}

/** A circle's alerts, newest first. */
export async function listAlerts(circleId: string): Promise<AlertRecord[]> {
  return normalize(await readJson(key(circleId)));
}

export type Failure = "too_soon";

/** The alerts with a new one first — or "too_soon", if this person sent one under a minute ago (pure, for tests). */
export function withAlert(
  alerts: AlertRecord[],
  alert: AlertRecord,
  now = Date.parse(alert.at)
): AlertRecord[] | Failure {
  const recent = alerts.find((entry) => entry.by.userId === alert.by.userId);
  if (recent && now - Date.parse(recent.at) < ALERT_GAP_MS) return "too_soon";
  return [alert, ...alerts].slice(0, KEEP);
}

/** Record an alert (before it's sent). */
export function addAlert(
  circleId: string,
  actor: Pick<Actor, "userId" | "personId" | "name">,
  input: { message: string; audience: AlertAudience },
  people: number
) {
  const alert: AlertRecord = {
    id: randomUUID(),
    circleId,
    at: new Date().toISOString(),
    by: { userId: actor.userId, personId: actor.personId ?? null, name: actor.name },
    audience: input.audience,
    message: input.message,
    people,
  };
  return mutateJson<{ ok: true; alert: AlertRecord } | { ok: false; reason: Failure }>(
    key(circleId),
    (raw) => {
      const alerts = withAlert(normalize(raw), alert);
      if (typeof alerts === "string")
        return { write: false, result: { ok: false, reason: alerts } };
      return { value: { alerts }, result: { ok: true, alert } };
    }
  );
}

export function deleteCircleAlerts(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}
