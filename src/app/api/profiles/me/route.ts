import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { renameUserForPerson } from "@/lib/auth/users";
import { phoneMatches, phoneDigits } from "@/lib/auth/phone";
import { readDirectory } from "@/lib/directory/store";
import { ProfileOverride, updateProfile } from "@/lib/profiles/store";
import { formatPhone, normalizeBirthday, profileUpdateSchema } from "@/lib/profiles/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function myEntry() {
  const user = await getSessionUser();
  if (!user?.personId) return { error: problem("Sign in to view your profile", 401, "Unauthorized") } as const;
  const directory = await readDirectory();
  const person = directory?.people.find((entry) => entry.id === user.personId);
  if (!directory || !person) return { error: problem("Your directory entry wasn't found", 404, "Not Found") } as const;
  return { user, directory, person } as const;
}

export async function GET() {
  const found = await myEntry();
  if ("error" in found) return found.error;
  return NextResponse.json({ profile: found.person }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Edit your own entry. Unit and owner/renter stay as imported. Changing either
 * phone number requires the current one, since phone numbers are passwords,
 * and at least one must remain so you can still sign in.
 */
export async function PATCH(request: NextRequest) {
  if (!rateLimit(`profile:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const found = await myEntry();
  if ("error" in found) return found.error;
  const { directory, person } = found;

  const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const input = parsed.data;
  const patch: Omit<Partial<ProfileOverride>, "updatedAt"> = {};

  if (input.firstName !== undefined || input.lastName !== undefined) {
    const firstName = input.firstName ?? person.firstName;
    const lastName = input.lastName ?? person.lastName;
    const displayName = `${firstName} ${lastName}`.trim();
    const taken = directory.people.some(
      (other) => other.id !== person.id && other.displayName.localeCompare(displayName, undefined, { sensitivity: "base" }) === 0
    );
    if (taken) return problem("Another resident already uses that name", 409, "Conflict");
    patch.firstName = firstName;
    patch.lastName = lastName;
  }

  if (input.email !== undefined) patch.email = input.email ? input.email.toLowerCase() : null;

  for (const field of ["phone", "landline"] as const) {
    const value = input[field];
    if (value === undefined) continue;
    const formatted = value ? formatPhone(value) : null;
    if (value && !formatted) return problem(`Enter a 10-digit ${field === "phone" ? "phone" : "landline"} number`);
    if (phoneDigits(formatted) !== phoneDigits(person[field])) patch[field] = formatted;
  }
  if (patch.phone !== undefined || patch.landline !== undefined) {
    if (!input.currentPhone || !phoneMatches(input.currentPhone, [person.phone, person.landline])) {
      return problem("Enter your current phone number to change your phone numbers", 403, "Forbidden");
    }
    const phone = patch.phone !== undefined ? patch.phone : person.phone;
    const landline = patch.landline !== undefined ? patch.landline : person.landline;
    if (!phone && !landline) {
      return problem("Keep at least one phone number — it's how you sign in");
    }
  }

  if (input.birthday !== undefined) {
    const birthday = input.birthday ? normalizeBirthday(input.birthday) : null;
    if (input.birthday && !birthday) return problem("Enter a birthday like “April 25”");
    patch.birthday = birthday;
  }

  if (input.bio !== undefined) patch.bio = input.bio || null;

  await updateProfile(person.id, patch);
  if (patch.firstName !== undefined) {
    await renameUserForPerson(person.id, `${patch.firstName} ${patch.lastName ?? ""}`.trim());
  }

  const updated = (await readDirectory())?.people.find((entry) => entry.id === person.id);
  return NextResponse.json({ profile: updated });
}
