import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canManageDirectory } from "@/lib/directory/access";
import { renameUserForPerson } from "@/lib/auth/users";
import { phoneMatches, phoneDigits } from "@/lib/auth/phone";
import { readDirectory } from "@/lib/directory/store";
import { deleteBinary, writeBinary } from "@/lib/storage";
import { ProfileOverride, isPersonId, photoKey, updateProfile } from "@/lib/profiles/store";
import { formatPhone, normalizeBirthday, profileUpdateSchema } from "@/lib/profiles/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES, sniffImageType } from "@/lib/images";

/**
 * Shared handlers for the profile routes. `/api/profiles/me` acts on the
 * signed-in resident's own entry; `/api/profiles/<personId>` acts on any entry,
 * which only that resident or a directory manager (an admin, or the Board
 * Secretary) may change.
 */

/** Whose entry: null means the signed-in resident's own. */
type Target = string | null;

async function resolve(target: Target) {
  const user = await getSessionUser();
  if (!user?.personId) return { error: problem("Sign in to view profiles", 401, "Unauthorized") } as const;
  const personId = target ?? user.personId;
  if (!isPersonId(personId)) return { error: problem("Profile not found", 404, "Not Found") } as const;
  const directory = await readDirectory();
  if (!directory) return { error: problem("Directory entry not found", 404, "Not Found") } as const;
  // "admin" here: may edit anyone's entry, including unit, role, and phone numbers without the current one.
  const admin = canManageDirectory(user, directory);
  if (personId !== user.personId && !admin) {
    return { error: problem("You can only change your own profile", 403, "Forbidden") } as const;
  }
  const person = directory.people.find((entry) => entry.id === personId);
  if (!person) return { error: problem("Directory entry not found", 404, "Not Found") } as const;
  return { user, admin, directory, person } as const;
}

export async function getProfile(target: Target) {
  const found = await resolve(target);
  if ("error" in found) return found.error;
  return NextResponse.json({ profile: found.person }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Edit an entry. Unit and owner/renter are for directory managers. Because phone numbers
 * are passwords, a resident changing one must give the current one (directory managers
 * can reset them without it), and at least one must remain so they can still
 * sign in.
 */
export async function patchProfile(request: NextRequest, target: Target) {
  if (!rateLimit(`profile:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const found = await resolve(target);
  if ("error" in found) return found.error;
  const { admin, directory, person } = found;

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
    if (!admin && (!input.currentPhone || !phoneMatches(input.currentPhone, [person.phone, person.landline]))) {
      return problem("Enter your current phone number to change your phone numbers", 403, "Forbidden");
    }
    const phone = patch.phone !== undefined ? patch.phone : person.phone;
    const landline = patch.landline !== undefined ? patch.landline : person.landline;
    if (!phone && !landline) {
      return problem("Keep at least one phone number — it's how residents sign in");
    }
  }

  if (input.birthday !== undefined) {
    const birthday = input.birthday ? normalizeBirthday(input.birthday) : null;
    if (input.birthday && !birthday) return problem("Enter a birthday like “April 25”");
    patch.birthday = birthday;
  }

  if (input.bio !== undefined) patch.bio = input.bio || null;

  // Unit and owner/renter are the directory managers' to change.
  if (input.unit !== undefined || input.role !== undefined) {
    if (!admin) return problem("Only the Board Secretary and admins can change a unit or role", 403, "Forbidden");
    if (input.unit !== undefined && input.unit !== person.unit) patch.unit = input.unit;
    if (input.role !== undefined && input.role !== person.role) patch.role = input.role;
  }

  await updateProfile(person.id, patch);
  if (patch.firstName !== undefined) {
    await renameUserForPerson(person.id, `${patch.firstName} ${patch.lastName ?? ""}`.trim());
  }

  const updated = (await readDirectory())?.people.find((entry) => entry.id === person.id);
  return NextResponse.json({ profile: updated });
}

/** Upload a profile photo as the raw request body (JPEG, PNG, or WebP). */
export async function uploadProfilePhoto(request: NextRequest, target: Target) {
  if (!rateLimit(`photo:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const found = await resolve(target);
  if ("error" in found) return found.error;
  const { person } = found;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return problem("Photo must be 1 MB or smaller", 413, "Payload Too Large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return problem("Photo must be 1 MB or smaller", 413, "Payload Too Large");

  const contentType = sniffImageType(bytes);
  if (!contentType) return problem("Upload a JPEG, PNG, or WebP image", 415, "Unsupported Media Type");

  await writeBinary(photoKey(person.id), { bytes, contentType });
  const profile = await updateProfile(person.id, { photo: { contentType, updatedAt: new Date().toISOString() } });
  return NextResponse.json({ photo: profile.photo }, { status: 201 });
}

export async function removeProfilePhoto(target: Target) {
  const found = await resolve(target);
  if ("error" in found) return found.error;
  await deleteBinary(photoKey(found.person.id));
  await updateProfile(found.person.id, { photo: null });
  return NextResponse.json({ ok: true });
}
