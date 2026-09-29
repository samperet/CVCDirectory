import { readJson, writeJsonDurable } from "@/lib/storage";
import { applyProfile, readProfiles } from "@/lib/profiles/store";
import { applyCircleIcon, readCircleIcons } from "@/lib/circles/icons";
import { readCircles } from "@/lib/circles/store";
import { applyPeopleChanges, readPeopleChanges } from "./people-store";
import { DirectoryDocument, DirectorySummary } from "./types";

/**
 * The community directory (residents, circles, carsheds) lives as a single
 * JSON document in R2. It holds residents' contact details, so it is only
 * ever written durably — never to the ephemeral local fallback — and is
 * readable only by signed-in residents (GET /api/directory).
 */
const DIRECTORY_KEY = "directory/directory.json";

/** The directory as imported from the spreadsheet, without residents' edits. */
export async function readImportedDirectory(): Promise<DirectoryDocument | null> {
  return (await readJson(DIRECTORY_KEY)) as DirectoryDocument | null;
}

/**
 * The directory as residents see it: people added or removed in the app,
 * their own profile edits and photos applied, and the circles as managed in
 * the app (with icons) in place of the imported ones.
 */
export async function readDirectory(): Promise<DirectoryDocument | null> {
  const [doc, profiles, icons, changes] = await Promise.all([readImportedDirectory(), readProfiles(), readCircleIcons(), readPeopleChanges()]);
  if (!doc) return null;
  const circles = await readCircles(doc.circles);
  return {
    ...doc,
    people: applyPeopleChanges(doc.people, changes).map((person) => applyProfile(person, profiles[person.id])),
    circles: circles.map((circle) => applyCircleIcon(circle, icons[circle.id])),
  };
}

export async function writeDirectory(doc: DirectoryDocument): Promise<void> {
  await writeJsonDurable(DIRECTORY_KEY, doc);
}

export function summarize(doc: DirectoryDocument): DirectorySummary {
  return {
    importedAt: doc.importedAt,
    people: doc.people.length,
    units: new Set(doc.people.map((p) => p.unit)).size,
    circles: doc.circles.map((c) => ({
      name: c.name,
      seats: c.seats.length,
      filled: c.seats.filter((s) => s.name).length,
    })),
    carshedSlots: doc.carsheds.length,
  };
}
