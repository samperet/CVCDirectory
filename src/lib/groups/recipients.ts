import { isEmailAddress } from "@/lib/email/shared";
import type { Delivery } from "./shared";

/**
 * Who a circle's message goes to by email: the circle's current members
 * (looked up afresh each time, so people who join get the next message and
 * people who leave don't), except its author, those who chose the web only,
 * and addresses the sender already wrote to directly — one copy per address
 * (a household sharing one gets it once). Test mode is applied afterwards,
 * at sending. Pure, for tests.
 */

export interface GroupRecipient {
  personId: string;
  email: string;
  name: string;
}

export function groupRecipients({
  memberIds,
  people,
  deliveryOf,
  exceptPersonId,
  alreadyAddressed = new Set<string>(),
}: {
  memberIds: (string | null)[];
  people: { id: string; displayName: string; email: string | null }[];
  deliveryOf: (personId: string) => Delivery;
  exceptPersonId: string | null;
  alreadyAddressed?: Set<string>;
}): { to: GroupRecipient[]; webOnly: number; noEmail: number } {
  const byId = new Map(people.map((person) => [person.id, person]));
  const seen = new Set<string>();
  const to: GroupRecipient[] = [];
  let webOnly = 0;
  let noEmail = 0;
  for (const id of Array.from(new Set(memberIds.filter((id): id is string => !!id)))) {
    if (id === exceptPersonId) continue;
    const person = byId.get(id);
    if (!person) continue;
    if (deliveryOf(id) === "web") {
      webOnly++;
      continue;
    }
    const email = person.email?.trim().toLowerCase();
    if (!email || !isEmailAddress(email)) {
      noEmail++;
      continue;
    }
    if (seen.has(email) || alreadyAddressed.has(email)) continue;
    seen.add(email);
    to.push({ personId: id, email, name: person.displayName });
  }
  return { to, webOnly, noEmail };
}
