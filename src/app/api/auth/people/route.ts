import { NextResponse } from "next/server";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Names for the sign-in dropdown: residents with a phone number on file,
 * since that is their password. Names and ids only — no contact details,
 * and no unit numbers.
 */
export async function GET() {
  const directory = await readDirectory();
  if (!directory) {
    return problem("Sign-in is unavailable until the resident directory is imported", 503, "Service Unavailable");
  }
  const people = directory.people
    .filter((person) => person.phone || person.landline)
    .map((person) => ({ id: person.id, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return NextResponse.json({ people });
}
