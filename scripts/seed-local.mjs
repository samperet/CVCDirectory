#!/usr/bin/env node
/**
 * Sample data for working on the app locally: `npm run seed` fills ./.data/
 * (what src/lib/storage.ts uses when no R2_* variables are set) with six
 * made-up residents, the Board, a Land Care Circle, and a few wiki pages.
 * Add --force to replace an existing .data/. Nothing here is a real
 * resident, and nothing real should ever be added.
 *
 * Then: AUTH_SECRET=local-test ADMIN_PERSON_IDS=000000000006 npm run dev
 * and sign in as any of the people printed below (Finn Fir is an admin).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), ".data");
if (existsSync(root) && !process.argv.includes("--force")) {
  console.error(".data/ already exists — run `npm run seed -- --force` to replace it.");
  process.exit(1);
}
rmSync(root, { recursive: true, force: true });

const save = (key, value) => {
  const file = join(root, key);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
};

// People: id, first, last, unit, role. Phones are the reserved 555-01xx range.
const PEOPLE = [
  ["000000000001", "Ada", "Ash", 1, "owner"],
  ["000000000002", "Ben", "Birch", 2, "owner"],
  ["000000000003", "Cara", "Cedar", 3, "owner"],
  ["000000000004", "Dev", "Dogwood", 3, "renter"],
  ["000000000005", "Eve", "Elm", 4, "owner"],
  ["000000000006", "Finn", "Fir", 5, "owner"],
];
const people = PEOPLE.map(([id, firstName, lastName, unit, role], index) => ({
  id,
  unit,
  firstName,
  lastName,
  displayName: `${firstName} ${lastName}`,
  role,
  resident: true,
  phone: `(802) 555-01${String(index).padStart(2, "0")}`,
  landline: null,
  email: `${firstName.toLowerCase()}@example.org`,
  birthday: null,
}));
const seat = (personId, position) => ({ position, termEnds: null, personId, name: people.find((person) => person.id === personId).displayName });
const now = new Date().toISOString();

save("directory/directory.json", {
  schemaVersion: 1,
  source: { title: "Sample directory", spreadsheetId: "sample" },
  importedAt: now,
  people,
  circles: [
    { id: "board", code: "B", name: "Board", seats: [seat("000000000001", "President"), seat("000000000002", "Secretary")] },
    { id: "lcc", code: "LCC", name: "Land Care Circle", seats: [seat("000000000003", "Op leader"), seat("000000000004", "Member")] },
  ],
  carsheds: [],
});

// A few wiki pages kept by the Land Care Circle (the circle store seeds itself from the directory above).
const author = { userId: "seed", name: "Cara Cedar" };
const page = (id, slug, title, body, color) => ({
  id: `0000000${id}-0000-4000-8000-000000000000`,
  slug,
  title,
  body,
  createdAt: now,
  createdBy: author,
  updatedAt: now,
  updatedBy: author,
  keeper: "lcc",
  view: { kind: "everyone" },
  edit: { kind: "keeper" },
  historyCount: 0,
  ...(color ? { color } : {}),
});
save("wiki/pages.json", {
  version: 1,
  pages: [
    page(1, "pellet-stove", "Pellet Stove", 'The stove in the common house.\n\nSee [[Maintenance log]].\n\n:::details{title="Winter care"}\nEmpty the ash pan.\n:::', "green"),
    page(2, "maintenance-log", "Maintenance log", "**Sep 12**: cleaned."),
    page(3, "mowing", "Mowing", "Mow the east field.", "blue"),
  ],
});

console.log("Seeded .data/ with sample data. Sign in as:");
for (const person of people) console.log(`  ${person.displayName.padEnd(12)} id ${person.id}  phone ${person.phone}`);
console.log("\nStart with: AUTH_SECRET=local-test ADMIN_PERSON_IDS=000000000006 npm run dev  (Finn Fir is then an admin)");
