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
}

export interface CircleSeat {
  position: string | null;
  termEnds: string | null;
  personId: string | null;
  name: string | null;
}

export interface Circle {
  id: string;
  code: string;
  name: string;
  seats: CircleSeat[];
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
}

/** Counts only — safe to return from admin endpoints and logs. */
export interface DirectorySummary {
  importedAt: string;
  people: number;
  units: number;
  circles: { code: string; seats: number; filled: number }[];
  carshedSlots: number;
}
