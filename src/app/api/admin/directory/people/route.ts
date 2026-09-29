import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminToken as authorize } from "@/lib/auth/admin-token";
import { findPerson, leaveUnit, removeFromDirectory, setResident } from "@/lib/directory/manage";
import { applyPeopleChanges, readPeopleChanges } from "@/lib/directory/people-store";
import { readDirectory, readImportedDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

const id = z.string().regex(/^[a-f0-9]{12}$/);
const schema = z.object({
  residents: z.array(z.object({ personId: id, resident: z.boolean() })).max(200).default([]),
  leaveUnit: z.array(z.object({ personId: id, unit: z.number().int() })).max(100).default([]),
  remove: z.array(id).max(100).default([]),
});

/**
 * Admin bulk directory changes, the same ones the Board Secretary makes on
 * person pages: mark who lives on site, take people out of a unit, and
 * remove people. Requires `Authorization: Bearer <ADMIN_TOKEN>`. Responses
 * carry names only — never contact details.
 */
export async function POST(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem("Body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("; "));
  }

  const imported = await readImportedDirectory();
  if (!imported) return problem("The directory hasn't been imported yet", 503, "Service Unavailable");
  const results: string[] = [];
  // Re-read before each change: each one can combine, move, or drop entries.
  const lookup = async (personId: string) => {
    const directory = await readDirectory();
    return { directory: directory!, person: directory ? findPerson(directory, personId) : null };
  };

  for (const { personId, resident } of parsed.data.residents) {
    const { directory, person } = await lookup(personId);
    if (!person) {
      results.push(`${personId}: not found`);
      continue;
    }
    await setResident(directory, person, resident);
    results.push(`${person.displayName}: ${resident ? "lives on site" : "doesn't live on site"}`);
  }

  for (const { personId, unit } of parsed.data.leaveUnit) {
    const { directory, person } = await lookup(personId);
    if (!person) {
      results.push(`${personId}: not found`);
      continue;
    }
    const entries = applyPeopleChanges(imported.people, await readPeopleChanges());
    const result = await leaveUnit(directory, entries, person, unit);
    results.push(`${person.displayName}: ${result === "left" ? `left unit ${unit}` : result.replace("_", " ")}`);
  }

  for (const personId of parsed.data.remove) {
    const { directory, person } = await lookup(personId);
    if (!person) {
      results.push(`${personId}: not found`);
      continue;
    }
    await removeFromDirectory(directory, imported.circles, person);
    results.push(`${person.displayName}: removed`);
  }

  return NextResponse.json({ results });
}
