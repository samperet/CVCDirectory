import { z } from "zod";
import { MONTHS } from "./months";

export { MONTHS };

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "April 25" (month and day, no year) or null when invalid. */
export function normalizeBirthday(input: string): string | null {
  const match = input.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2})$/);
  if (!match) return null;
  const month = MONTHS.findIndex((name) => name.toLowerCase().startsWith(match[1].toLowerCase().slice(0, 3)));
  const day = Number(match[2]);
  if (month === -1 || day < 1 || day > DAYS_IN_MONTH[month]) return null;
  return `${MONTHS[month]} ${day}`;
}

/** A US number as XXX-XXX-XXXX, or null when it isn't 10 digits (an optional leading 1 is dropped). */
export function formatPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : null;
}

/** Empty strings clear a field. */
export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50).optional(),
  lastName: z.string().trim().max(50).optional(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address").max(254)]).optional(),
  phone: z.string().trim().max(40).optional(),
  landline: z.string().trim().max(40).optional(),
  birthday: z.string().trim().max(20).optional(),
  bio: z.string().trim().max(500, "Bio must be 500 characters or fewer").optional(),
  /** Directory managers only. */
  unit: z.coerce.number().int().min(1, "Enter a unit number").max(999).optional(),
  role: z.enum(["owner", "renter", "household"]).optional(),
  resident: z.boolean().optional(),
  /** Required to change either phone number, since phone numbers are how residents sign in. */
  currentPhone: z.string().trim().max(40).optional(),
});
