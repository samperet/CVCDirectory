import { NextResponse } from "next/server";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";
import { signInEmailOf } from "@/lib/auth/sign-in";

export const dynamic = "force-dynamic";

/**
 * Names for the sign-in dropdown: residents with an email address on file,
 * where their sign-in links go. Names and ids only — no contact details,
 * and no unit numbers.
 */
export async function GET() {
  const directory = await readDirectory();
  if (!directory) {
    return problem("Sign-in is unavailable until the resident directory is imported", 503);
  }
  const people = directory.people
    .filter((person) => signInEmailOf(person))
    .map((person) => ({ id: person.id, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return NextResponse.json({ people });
}
