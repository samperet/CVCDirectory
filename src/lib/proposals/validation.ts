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

const sectionSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().trim().min(1, "Section title is required").max(120),
  icon: z.string().max(30).optional().default("sprout"),
  paragraphs: z.array(z.string().trim().min(1).max(3000)).max(20),
  bullets: z.array(z.string().trim().min(1).max(600)).max(20).optional(),
});

export const proposalContentUpdateSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
  summary: z.string().trim().min(10, "Summary must be at least 10 characters").max(1200),
  proposer: z.string().trim().min(1, "Proposer is required").max(80),
  circle: z.string().trim().min(1, "Circle is required").max(80),
  sections: z.array(sectionSchema).min(1, "At least one section is required").max(20),
});

export const proposalCreateSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
  summary: z.string().trim().min(10, "Summary must be at least 10 characters").max(1200),
  proposer: z.string().trim().min(1, "Proposer is required").max(80),
  circle: z.string().trim().min(1, "Circle is required").max(80),
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
