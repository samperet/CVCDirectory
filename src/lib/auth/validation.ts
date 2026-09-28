import { z } from "zod";

export const loginSchema = z.object({
  personId: z.string().min(1, "Select your name").max(64),
  phone: z.string().trim().min(1, "Enter your phone number").max(40, "Phone number is too long"),
});
