import { mutateJson, readJson } from "@/lib/storage";
import type { Delivery } from "./shared";

/**
 * How each resident gets each circle's messages — every message by email
 * (the default for members), or only on the web — keyed by directory person
 * id, so it works for residents who have never signed in (an email's "Get
 * these on the web only" link sets it without signing in).
 */

const KEY = "groups/delivery.json";
type ByPerson = Record<string, Record<string, Delivery>>;

function normalize(raw: unknown): ByPerson {
  const byPerson = (raw as { byPerson?: unknown } | null)?.byPerson;
  return byPerson && typeof byPerson === "object" ? (byPerson as ByPerson) : {};
}

export async function allDeliveries(): Promise<ByPerson> {
  return normalize(await readJson(KEY));
}

export const deliveryOf = (all: ByPerson, personId: string, circleId: string): Delivery =>
  all[personId]?.[circleId] ?? "each";

export function setDelivery(personId: string, circleId: string, delivery: Delivery) {
  return mutateJson(KEY, (raw) => {
    const all = normalize(raw);
    if (deliveryOf(all, personId, circleId) === delivery) return { write: false, result: delivery };
    return {
      value: { byPerson: { ...all, [personId]: { ...all[personId], [circleId]: delivery } } },
      result: delivery,
    };
  });
}

/** Every circle on the web only, for one person ("stop all emails"). */
export function webOnlyEverywhere(personId: string, circleIds: string[]) {
  return mutateJson(KEY, (raw) => {
    const all = normalize(raw);
    const mine = { ...all[personId] };
    for (const id of circleIds) mine[id] = "web";
    return { value: { byPerson: { ...all, [personId]: mine } }, result: undefined };
  });
}
