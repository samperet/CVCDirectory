import { z } from "zod";

const optionalName = z
  .string()
  .trim()
  .max(80, "Name must be 80 characters or fewer")
  .optional()
  .transform((value) => (value ? value : null));

export const questionInputSchema = z.object({
  sectionId: z.string().min(1, "A section is required"),
  authorName: z
    .string()
    .trim()
    .min(1, "Please share your name so neighbors know who is asking")
    .max(80, "Name must be 80 characters or fewer"),
  body: z
    .string()
    .trim()
    .min(5, "Question must be at least 5 characters")
    .max(2000, "Question must be 2000 characters or fewer"),
});

export const responseInputSchema = z.object({
  authorName: z
    .string()
    .trim()
    .min(1, "Please share your name")
    .max(80, "Name must be 80 characters or fewer"),
  body: z
    .string()
    .trim()
    .min(1, "Response cannot be empty")
    .max(2000, "Response must be 2000 characters or fewer"),
});

export const extendInputSchema = z.object({
  name: optionalName,
});

export const meetingRequestInputSchema = z.object({
  name: optionalName,
  note: z
    .string()
    .trim()
    .max(500, "Note must be 500 characters or fewer")
    .optional()
    .transform((value) => (value ? value : null)),
});
