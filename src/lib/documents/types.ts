import type { Actor } from "@/lib/auth/actor";
import type { NamedPerson } from "@/lib/people";
/**
 * Circle documents: shared by the server and the browser (no server imports).
 *
 * Documents belong to a circle (community-wide ones to the Board), are
 * visible to every signed-in resident, keep every version when replaced, and
 * are searchable by their details and — for PDFs, Word, Excel, PowerPoint,
 * and text files — by their contents.
 */

/** One of a circle's document types. Each circle edits its own list. */
export interface DocumentTypeOption {
  id: string;
  label: string;
}

/** The types a circle starts with, until it edits them. */
export const DEFAULT_DOCUMENT_TYPES: DocumentTypeOption[] = [
  { id: "minutes", label: "Minutes" },
  { id: "agenda", label: "Agenda" },
  { id: "policy", label: "Policy" },
  { id: "budget", label: "Budget" },
  { id: "report", label: "Report" },
  { id: "other", label: "Other" },
];

export const MAX_DOCUMENT_TYPES = 20;

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
/** Uploads travel in pieces this size, under the hosting platform's per-request limit. */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

/** File extensions residents may upload. */
export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".doc",
  ".xls",
  ".ppt",
  ".txt",
  ".csv",
  ".md",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

/** Who uploaded a version (stored with it). */
export type Uploader = Pick<Actor, "userId" | "personId" | "name">;

export interface DocumentVersion {
  number: number;
  fileName: string;
  size: number;
  contentType: string;
  /** How the file is shown: opened in the browser, or downloaded. */
  viewable: boolean;
  /** Characters of searchable text found in the file (0 for scans, images, and older Office formats). */
  textChars: number;
  uploadedBy: Uploader;
  uploadedAt: string;
}

export interface DocumentRecord {
  id: string;
  circleId: string;
  title: string;
  description: string | null;
  /** One of the circle's document types (its id). */
  type: string;
  /** The type's name when last set, shown if the circle later removes that type. */
  typeLabel?: string;
  /** For minutes and agendas: the meeting's date (YYYY-MM-DD). */
  meetingDate: string | null;
  versions: DocumentVersion[];
  createdAt: string;
  updatedAt: string;
  /** The circle's consent, recorded by one of its members (or the Board): to one version of the document. */
  consent?: DocumentConsent | null;
}

export interface DocumentConsent {
  /** The version consented to; a later version isn't consented until the circle consents again. */
  version: number;
  /** The day the circle consented (YYYY-MM-DD). */
  date: string;
  /** Who consented: the circle's members (or anyone else) who gave it. Older records don't say. */
  consentedBy?: NamedPerson[];
  /** Who recorded it here. */
  recordedBy: { personId: string | null; name: string };
  recordedAt: string;
}

/**
 * "consented" while the consented version is current; "changed" once a newer
 * version has replaced it; null if the circle hasn't consented.
 */
export function consentState(
  doc: Pick<DocumentRecord, "consent" | "versions">
): "consented" | "changed" | null {
  if (!doc.consent) return null;
  return doc.consent.version === doc.versions[doc.versions.length - 1]?.number
    ? "consented"
    : "changed";
}

/** A document as listed or found by search, with what the viewer may do. */
export interface DocumentListing extends DocumentRecord {
  circleName: string;
  /** The type's current name. */
  typeLabel: string;
  canManage: boolean;
  /** Whether you can record (or withdraw) the circle's consent: its members, the Board, admins. */
  canConsent: boolean;
  /** Whether you can turn it into a written page (you can start pages for its circle). */
  canWritePage: boolean;
  /** Search results only: the passage around the first match. */
  snippet?: string | null;
}

export const currentVersion = (doc: DocumentRecord) => doc.versions[doc.versions.length - 1];

/** The date a document is "for": its meeting, or when it was first uploaded. */
export const documentDate = (doc: DocumentRecord) => doc.meetingDate ?? doc.createdAt.slice(0, 10);

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
