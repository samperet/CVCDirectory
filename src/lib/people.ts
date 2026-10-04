import { z } from "zod";

/**
 * Someone named on a record — who was present for a meeting's notes, who a
 * log update involved, who consented to a document: a resident (by
 * directory id, with their name as it was then), or anyone else by name
 * alone. Safe for the browser.
 */
export interface NamedPerson {
  /** Unset for someone who isn't in the directory. */
  personId?: string;
  name: string;
}

/** "Ada Ash, Ben Birch and Cara Cedar": everyone named, in order. */
export function namesOf(people: NamedPerson[]): string {
  const names = people.map((person) => person.name);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    : names.join("");
}

/** A list of named people, at most `max` of them; with `required`, at least one (and that message if not). */
export const namedPeopleSchema = (max: number, required?: string) => {
  const list = z
    .array(
      z.object({
        personId: z
          .string()
          .regex(/^[a-f0-9]{12}$/)
          .optional(),
        name: z.string().trim().min(1).max(80),
      }),
      required ? { required_error: required } : undefined
    )
    .max(max);
  return required ? list.min(1, required) : list;
};
