import type { Circle } from "@/lib/circles/types";

export type PersonRole = "owner" | "renter" | "household";

export interface Person {
  id: string;
  unit: number;
  firstName: string;
  lastName: string;
  displayName: string;
  role: PersonRole;
  resident: boolean | null;
  phone: string | null;
  landline: string | null;
  email: string | null;
  birthday: string | null;
  /** From the resident's own profile edits; not part of the import. */
  bio?: string | null;
  photoUrl?: string | null;
  /**
   * Every unit this person is listed in, when more than one — e.g. a child
   * who lives in two households. `unit` is the first of them.
   */
  units?: number[];
}

export interface CarshedSlot {
  row: "northern" | "western";
  slot: string;
  unit: number;
  occupants: { personId: string | null; name: string }[];
}

export interface DirectoryDocument {
  schemaVersion: 1;
  source: { title: string; spreadsheetId: string; carshedsLastUpdated?: string };
  importedAt: string;
  people: Person[];
  circles: Circle[];
  carsheds: CarshedSlot[];
  /** Entries combined into one profile: each duplicate's id → the profile it's now part of. */
  aliases?: Record<string, string>;
}

/** Counts only — safe to return from admin endpoints and logs. */
export interface DirectorySummary {
  importedAt: string;
  people: number;
  units: number;
  circles: { name: string; seats: number; filled: number }[];
  carshedSlots: number;
}
