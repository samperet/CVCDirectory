import { TOPICS, type Preferences, type Topic } from "@/lib/push/topics";

/**
 * Who an email about something just posted goes to — safe for the browser
 * and for tests (no storage). Every notification topic can be emailed too;
 * each resident chooses which (keyed by their directory person id, so those
 * who have never signed in can be emailed and unsubscribe). While the admin
 * has **test mode** on, only addresses on its allow-list are emailed;
 * everyone else who would have been is counted as skipped.
 */

export { TOPICS, type Topic };

/** What residents are emailed about until they choose: what's addressed to them, and discussions. */
export const DEFAULT_EMAIL_PREFERENCES: Preferences = {
  discussions: true,
  replies: true,
  appreciations: false,
  photos: false,
  resources: false,
  library: false,
  documents: false,
  circles: true,
  polls: true,
  wiki: true,
  tasks: true,
};

export const emailPreferencesFor = (saved: Partial<Preferences> | undefined): Preferences => ({
  ...DEFAULT_EMAIL_PREFERENCES,
  ...saved,
});

export interface EmailSettings {
  /** Only the allowed addresses are emailed. On until an admin turns it off. */
  testMode: boolean;
  /** Addresses that may be emailed in test mode, lowercased. */
  allowed: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  testMode: true,
  allowed: [],
  updatedAt: null,
  updatedBy: null,
};

/** One sending, as the admin page lists it: counts only (and, in test mode, the addresses). */
export interface EmailLogEntry {
  at: string;
  /** A notification's topic, an admin's test, or a new member's welcome (`sendDirectEmail`). */
  topic: Topic | "test" | "welcome";
  subject: string;
  sent: number;
  skipped: number;
  failed: number;
  testMode: boolean;
  /** Who it went to — only kept for test sends, which go to the allow-list. */
  to?: string[];
}

export const isEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export interface EmailPerson {
  id: string;
  email: string | null;
}

/**
 * The people to email about a `topic`: those it's for (`onlyPersonIds`, or
 * everyone), not its author, with an address, who chose this topic — one
 * email per address. In test mode only allowed addresses get one; the rest
 * are `skipped`.
 */
export function chooseRecipients({
  people,
  topic,
  preferences,
  onlyPersonIds,
  exceptPersonId,
  settings,
}: {
  people: EmailPerson[];
  topic: Topic;
  preferences: Record<string, Partial<Preferences> | undefined>;
  onlyPersonIds: Set<string> | null;
  exceptPersonId: string | null;
  settings: Pick<EmailSettings, "testMode" | "allowed">;
}): { to: { personId: string; email: string }[]; skipped: number } {
  const allowed = new Set(settings.allowed.map((address) => address.toLowerCase()));
  const seen = new Set<string>();
  const to: { personId: string; email: string }[] = [];
  let skipped = 0;
  for (const person of people) {
    if (person.id === exceptPersonId) continue;
    if (onlyPersonIds && !onlyPersonIds.has(person.id)) continue;
    const email = person.email?.trim().toLowerCase();
    if (!email || !isEmailAddress(email) || seen.has(email)) continue;
    if (!emailPreferencesFor(preferences[person.id])[topic]) continue;
    seen.add(email);
    if (settings.testMode && !allowed.has(email)) skipped++;
    else to.push({ personId: person.id, email });
  }
  return { to, skipped };
}
