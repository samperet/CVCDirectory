import { z } from "zod";

export const linkRequestSchema = z.object({
  personId: z.string().min(1, "Select your name").max(64),
  next: z.string().max(500).optional(),
});

export const codeSchema = z.object({
  personId: z.string().min(1, "Select your name").max(64),
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 6, "Enter the six-digit code from the email"),
});

/** A sign-in link's token, as it appears in the link. */
export const isLinkToken = (value: string) => /^[A-Za-z0-9_-]{20,64}$/.test(value);
