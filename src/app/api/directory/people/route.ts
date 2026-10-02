import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { canManageDirectory } from "@/lib/directory/access";
import { addPerson, newPersonId } from "@/lib/directory/people-store";
import { readDirectory } from "@/lib/directory/store";
import type { Person } from "@/lib/directory/types";
import { updateProfile } from "@/lib/profiles/store";
import { formatPhone, normalizeBirthday } from "@/lib/profiles/validation";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50),
  lastName: z.string().trim().max(50).default(""),
  unit: z.coerce.number().int().min(1, "Enter a unit number").max(999),
  role: z.enum(["owner", "renter", "household"]),
  phone: z.string().trim().max(40).default(""),
  landline: z.string().trim().max(40).default(""),
  email: z
    .union([z.literal(""), z.string().trim().email("Enter a valid email address").max(254)])
    .default(""),
  birthday: z.string().trim().max(20).default(""),
  bio: z.string().trim().max(500).default(""),
});

/** Add a resident to the directory: the Board Secretary or an admin. They can then sign in with their phone number. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const directory = await readDirectory();
  if (!directory) return problem("The directory hasn't been imported yet", 503);
  if (!canManageDirectory(user, directory))
    return problem("Only the Board Secretary and admins can add people", 403);

  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;

  const displayName = `${input.firstName} ${input.lastName}`.trim();
  if (
    directory.people.some(
      (person) =>
        person.displayName.localeCompare(displayName, undefined, { sensitivity: "base" }) === 0
    )
  ) {
    return problem("Someone in the directory already has that name", 409);
  }
  const phone = input.phone ? formatPhone(input.phone) : null;
  if (input.phone && !phone) return problem("Enter a 10-digit phone number");
  const landline = input.landline ? formatPhone(input.landline) : null;
  if (input.landline && !landline) return problem("Enter a 10-digit landline number");
  const birthday = input.birthday ? normalizeBirthday(input.birthday) : null;
  if (input.birthday && !birthday) return problem("Enter a birthday like “April 25”");

  const person: Person = {
    id: newPersonId(),
    unit: input.unit,
    firstName: input.firstName,
    lastName: input.lastName,
    displayName,
    role: input.role,
    resident: true,
    phone,
    landline,
    email: input.email ? input.email.toLowerCase() : null,
    birthday,
  };
  await addPerson(person);
  if (input.bio) await updateProfile(person.id, { bio: input.bio });
  return NextResponse.json({ person }, { status: 201 });
}
