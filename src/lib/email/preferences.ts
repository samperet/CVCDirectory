import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import { TOPICS, type Preferences, type Topic } from "@/lib/push/topics";
import { emailPreferencesFor } from "./shared";

/**
 * Each resident's choice of what to be emailed about, keyed by directory
 * person id (so someone who has never signed in can still unsubscribe from
 * an email's link). Unset topics follow `DEFAULT_EMAIL_PREFERENCES`.
 */

const KEY = "email/preferences.json";

export const emailPreferencesSchema = z
  .object(
    Object.fromEntries(
      Object.keys(TOPICS).map((topic) => [topic, z.boolean().optional()])
    ) as Record<Topic, z.ZodOptional<z.ZodBoolean>>
  )
  .strict();

function normalize(raw: unknown): Record<string, Partial<Preferences>> {
  const byPerson = (raw as { byPerson?: unknown } | null)?.byPerson;
  return byPerson && typeof byPerson === "object"
    ? (byPerson as Record<string, Partial<Preferences>>)
    : {};
}

/** Everyone's saved choices (only what they've changed). */
export async function allEmailPreferences(): Promise<Record<string, Partial<Preferences>>> {
  return normalize(await readJson(KEY));
}

export async function emailPreferences(personId: string): Promise<Preferences> {
  return emailPreferencesFor((await allEmailPreferences())[personId]);
}

export function updateEmailPreferences(
  personId: string,
  update: Partial<Preferences>
): Promise<Preferences> {
  return mutateJson(KEY, (raw) => {
    const byPerson = normalize(raw);
    const saved = { ...byPerson[personId], ...update };
    return {
      value: { byPerson: { ...byPerson, [personId]: saved } },
      result: emailPreferencesFor(saved),
    };
  });
}

/** Every topic off: an email's "unsubscribe from all". */
export const NO_EMAIL = Object.fromEntries(
  Object.keys(TOPICS).map((topic) => [topic, false])
) as Preferences;
