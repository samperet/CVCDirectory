import { z } from "zod";

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be 80 characters or fewer"),
});

export const loginSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
});

export const magicLinkSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address").max(254),
});
