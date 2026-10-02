import { z } from "zod";

const nullableString = z.string().trim().min(1).max(200).nullable();

const personSchema = z.object({
  id: z.string().min(1).max(64),
  unit: z.number().int().min(1).max(999),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(["owner", "renter", "household"]),
  resident: z.boolean().nullable(),
  phone: nullableString,
  landline: nullableString,
  email: z.string().trim().email().max(254).nullable(),
  birthday: nullableString,
});

const circleSchema = z.object({
  id: z.string().min(1).max(40),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  seats: z
    .array(
      z.object({
        position: nullableString,
        termEnds: nullableString,
        personId: z.string().max(64).nullable(),
        name: nullableString,
      })
    )
    .max(100),
});

const carshedSchema = z.object({
  row: z.enum(["northern", "western"]),
  slot: z.string().trim().min(1).max(40),
  unit: z.number().int().min(1).max(999),
  occupants: z
    .array(
      z.object({ personId: z.string().max(64).nullable(), name: z.string().trim().min(1).max(200) })
    )
    .max(10),
});

export const directoryDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.object({
      title: z.string().max(200),
      spreadsheetId: z.string().max(200),
      carshedsLastUpdated: z.string().max(40).optional(),
    }),
    importedAt: z.string().datetime({ offset: true }),
    people: z.array(personSchema).min(1).max(2000),
    circles: z.array(circleSchema).max(100),
    carsheds: z.array(carshedSchema).max(200),
  })
  .superRefine((doc, ctx) => {
    // Every cross-reference must point at a person in this same document.
    const ids = new Set(doc.people.map((p) => p.id));
    if (ids.size !== doc.people.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate person ids" });
    }
    const refs = [
      ...doc.circles.flatMap((c) => c.seats.map((s) => s.personId)),
      ...doc.carsheds.flatMap((c) => c.occupants.map((o) => o.personId)),
    ].filter((id): id is string => id !== null);
    const dangling = refs.filter((id) => !ids.has(id));
    if (dangling.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${dangling.length} reference(s) to unknown people`,
      });
    }
  });
