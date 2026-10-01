import type { CircleModule, InfoView, SectionLayout } from "@/lib/circles/layout";
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

export interface CircleSeat {
  /** Present once circles are managed in the app; the import has no seat ids. */
  id?: string;
  position: string | null;
  termEnds: string | null;
  personId: string | null;
  name: string | null;
}

/** A resident asking to join a circle that approves its members. */
export interface CircleApplication {
  id: string;
  personId: string;
  name: string;
  message: string | null;
  createdAt: string;
}

/** An official sociocratic circle, or a social club (e.g. the Chicken Tenders). */
export type CircleKind = "circle" | "club";

/** Who can join a circle: anyone, with a Join button, or by applying for its members to approve. */
export type JoinPolicy = "open" | "apply";

export interface Circle {
  id: string;
  /** The spreadsheet's short code, kept from the import; no longer shown or asked for. */
  code?: string;
  name: string;
  description?: string | null;
  seats: CircleSeat[];
  /** Uploaded by the circle; not part of the import. */
  iconUrl?: string | null;
  /** Unset means "apply": members approve who joins (as before joining existed). */
  joinPolicy?: JoinPolicy;
  /** "club" for a social club; unset for an official, sociocratically formed circle. */
  kind?: CircleKind;
  /** Which of its pages' sections the circle uses; each is on unless set to false. */
  features?: { documents?: boolean; wiki?: boolean; tasks?: boolean };
  /** How its page is laid out (see `src/lib/circles/layout.ts`); unset is the default. */
  layout?: SectionLayout[];
  /** How its Information section shows pages; unset is "summary". */
  infoView?: InfoView;
  /** Its page, as modules (see `modulesFor`); unset means as `layout`, `features`, and `infoView` describe. */
  modules?: CircleModule[];
  /** Wiki pages (their addresses) once pinned to the circle's page, from before pinning was removed; no longer used. */
  pinnedWiki?: string[];
  /** Pending applications; only the circle's members, the Board, and admins see them. */
  applications?: CircleApplication[];
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
