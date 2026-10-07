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
  // Circle forum messages are app notifications only.
  groups: false,
};

/** Topics that are never emailed as notifications (and aren't offered under "Email me about"). */
export const PUSH_ONLY_TOPICS: Topic[] = ["groups"];

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

/** The email providers, in the order they're tried (see deliver.ts). */
export const PROVIDER_NAMES = { brevo: "Brevo", resend: "Resend" } as const;

/** One sending, as the admin page lists it: counts only (and, in test mode, the addresses). */
export interface EmailLogEntry {
  at: string;
  /**
   * A notification topic, an admin's test, a new member's welcome or a sign-in link
   * (`sendDirectEmail`). "group", "summary" and "confirm" are from the group email the app
   * once had, and stay readable in the log.
   */
  topic: Topic | "test" | "welcome" | "sign-in" | "group" | "summary" | "confirm";
  /** For the old group email: the circle. */
  circleId?: string;
  subject: string;
  sent: number;
  skipped: number;
  failed: number;
  /** Over the free plan's quota: not sent. */
  overQuota?: number;
  /** How many each provider took. */
  by?: Partial<Record<keyof typeof PROVIDER_NAMES, number>>;
  /** Why a provider refused (its status, code and message), when one did. */
  errors?: Partial<Record<keyof typeof PROVIDER_NAMES, string>>;
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
