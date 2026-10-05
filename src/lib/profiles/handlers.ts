import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canManageDirectory } from "@/lib/directory/access";
import { renameUserForPerson } from "@/lib/auth/users";
import { readDirectory } from "@/lib/directory/store";
import { entriesOf } from "@/lib/directory/manage";
import { deleteBinary, writeBinary } from "@/lib/storage";
import { ProfileOverride, isPersonId, photoKey, updateProfile } from "@/lib/profiles/store";
import {
  formatPhone,
  normalizeBirthday,
  phoneDigits,
  profileUpdateSchema,
} from "@/lib/profiles/validation";
import { problem, readBody, throttled } from "@/lib/http";
import { MAX_IMAGE_BYTES, readImageUpload } from "@/lib/images";

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
  if (!user?.personId) return { error: problem("Sign in to view profiles", 401) } as const;
  const requested = target ?? user.personId;
  if (!isPersonId(requested)) return { error: problem("Profile not found", 404) } as const;
  const directory = await readDirectory();
  if (!directory) return { error: problem("Directory entry not found", 404) } as const;
  // An entry combined into another profile (listed in two households) edits that profile.
  const personId = directory.aliases?.[requested] ?? requested;
  // "admin" here: may edit anyone's entry, including unit and role.
  const admin = canManageDirectory(user, directory);
  if (personId !== user.personId && !admin) {
    return { error: problem("You can only change your own profile", 403) } as const;
  }
  const person = directory.people.find((entry) => entry.id === personId);
  if (!person) return { error: problem("Directory entry not found", 404) } as const;
  return { user, admin, directory, person } as const;
}

export async function getProfile(target: Target) {
  const found = await resolve(target);
  if ("error" in found) return found.error;
  return NextResponse.json(
    { profile: found.person },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Edit an entry. Unit and owner/renter are for directory managers. The email
 * address is where sign-in links go, so a resident can change theirs but not
 * remove it (directory managers can).
 */
export async function patchProfile(request: NextRequest, target: Target) {
  const limited = throttled(request, "profile");
  if (limited) return limited;
  const found = await resolve(target);
  if ("error" in found) return found.error;
  const { admin, directory, person } = found;

  const parsed = await readBody(request, profileUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  const patch: Omit<Partial<ProfileOverride>, "updatedAt"> = {};

  if (input.firstName !== undefined || input.lastName !== undefined) {
    const firstName = input.firstName ?? person.firstName;
    const lastName = input.lastName ?? person.lastName;
    const displayName = `${firstName} ${lastName}`.trim();
    const taken = directory.people.some(
      (other) =>
        other.id !== person.id &&
        other.displayName.localeCompare(displayName, undefined, { sensitivity: "base" }) === 0
    );
    if (taken) return problem("Another resident already uses that name", 409);
    patch.firstName = firstName;
    patch.lastName = lastName;
  }

  if (input.email !== undefined) {
    if (!input.email && person.email && !admin)
      return problem("Keep an email address — it's where your sign-in links go");
    patch.email = input.email ? input.email.toLowerCase() : null;
  }

  for (const field of ["phone", "landline"] as const) {
    const value = input[field];
    if (value === undefined) continue;
    const formatted = value ? formatPhone(value) : null;
    if (value && !formatted)
      return problem(`Enter a 10-digit ${field === "phone" ? "phone" : "landline"} number`);
    if (phoneDigits(formatted) !== phoneDigits(person[field])) patch[field] = formatted;
  }
  if (input.birthday !== undefined) {
    const birthday = input.birthday ? normalizeBirthday(input.birthday) : null;
    if (input.birthday && !birthday) return problem("Enter a birthday like “April 25”");
    patch.birthday = birthday;
  }

  if (input.bio !== undefined) patch.bio = input.bio || null;

  // Unit and owner/renter are the directory managers' to change.
  if (input.unit !== undefined || input.role !== undefined || input.resident !== undefined) {
    if (!admin)
      return problem(
        "Only the Board Secretary and admins can change a unit, role, or where someone lives",
        403
      );
    if (input.resident !== undefined && input.resident !== (person.resident !== false))
      patch.resident = input.resident;
    if (input.unit !== undefined && input.unit !== person.unit) patch.unit = input.unit;
    if (input.role !== undefined && input.role !== person.role) patch.role = input.role;
  }

  await updateProfile(person.id, patch);
  if (patch.resident !== undefined) {
    // A combined profile lives on site if any of its entries does, so mark them all.
    for (const entry of entriesOf(directory, person.id).slice(1))
      await updateProfile(entry, { resident: patch.resident });
  }
  if (patch.firstName !== undefined) {
    await renameUserForPerson(person.id, `${patch.firstName} ${patch.lastName ?? ""}`.trim());
  }

  const updated = (await readDirectory())?.people.find((entry) => entry.id === person.id);
  return NextResponse.json({ profile: updated });
}

/** Upload a profile photo as the raw request body (JPEG, PNG, or WebP). */
export async function uploadProfilePhoto(request: NextRequest, target: Target) {
  const limited = throttled(request, "photo");
  if (limited) return limited;
  const found = await resolve(target);
  if ("error" in found) return found.error;
  const { person } = found;

  const upload = await readImageUpload(request, { maxBytes: MAX_IMAGE_BYTES, label: "Photo" });
  if ("error" in upload) return upload.error;
  await writeBinary(photoKey(person.id), upload.file);
  const profile = await updateProfile(person.id, {
    photo: { contentType: upload.file.contentType, updatedAt: new Date().toISOString() },
  });
  return NextResponse.json({ photo: profile.photo }, { status: 201 });
}

export async function removeProfilePhoto(target: Target) {
  const found = await resolve(target);
  if ("error" in found) return found.error;
  await deleteBinary(photoKey(found.person.id));
  await updateProfile(found.person.id, { photo: null });
  return NextResponse.json({ ok: true });
}
