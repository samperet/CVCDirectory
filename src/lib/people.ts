import { z } from "zod";

/**
 * Someone named on a record — who was present for a meeting's notes, who a
 * log update involved: a resident (by directory id, with their name as it
 * was then), or anyone else by name alone. Safe for the browser.
 */
export interface NamedPerson {
  /** Unset for someone who isn't in the directory. */
  personId?: string;
  name: string;
}

/** A list of named people, at most `max` of them. */
export const namedPeopleSchema = (max: number) =>
  z
    .array(
      z.object({
        personId: z
          .string()
          .regex(/^[a-f0-9]{12}$/)
          .optional(),
        name: z.string().trim().min(1).max(80),
      })
    )
    .max(max);
