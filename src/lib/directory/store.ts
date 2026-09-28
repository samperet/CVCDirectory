import { readJson, writeJsonDurable } from "@/lib/storage";
import { DirectoryDocument, DirectorySummary } from "./types";

/**
 * The community directory (residents, circles, carsheds) lives as a single
 * JSON document in R2. It holds residents' contact details, so it is only
 * ever written durably — never to the ephemeral local fallback — and is
 * readable only by signed-in residents (GET /api/directory).
 */
const DIRECTORY_KEY = "directory/directory.json";

export async function readDirectory(): Promise<DirectoryDocument | null> {
  return (await readJson(DIRECTORY_KEY)) as DirectoryDocument | null;
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
      code: c.code,
      seats: c.seats.length,
      filled: c.seats.filter((s) => s.name).length,
    })),
    carshedSlots: doc.carsheds.length,
  };
}
