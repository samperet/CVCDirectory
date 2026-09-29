/**
 * Circle documents: shared by the server and the browser (no server imports).
 *
 * Documents belong to a circle (community-wide ones to the Board), are
 * visible to every signed-in resident, keep every version when replaced, and
 * are searchable by their details and — for PDFs, Word, Excel, PowerPoint,
 * and text files — by their contents.
 */

export const DOCUMENT_TYPES = ["minutes", "agenda", "policy", "budget", "report", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  minutes: "Minutes",
  agenda: "Agenda",
  policy: "Policy",
  budget: "Budget",
  report: "Report",
  other: "Other",
};

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
/** Uploads travel in pieces this size, under the hosting platform's per-request limit. */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

/** File extensions residents may upload. */
export const ACCEPTED_EXTENSIONS = [
  ".pdf", ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".txt", ".csv", ".md", ".jpg", ".jpeg", ".png", ".webp",
];

export interface Uploader {
  userId: string;
  personId: string | null;
  name: string;
}

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
  type: DocumentType;
  /** For minutes and agendas: the meeting's date (YYYY-MM-DD). */
  meetingDate: string | null;
  versions: DocumentVersion[];
  createdAt: string;
  updatedAt: string;
}

/** A document as listed or found by search, with what the viewer may do. */
export interface DocumentListing extends DocumentRecord {
  circleName: string;
  canManage: boolean;
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

/** Split a search into terms; "quoted phrases" stay together. */
export function searchTerms(query: string) {
  const terms: string[] = [];
  for (const match of query.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (match[1] ?? match[2]).trim();
    if (term) terms.push(term);
  }
  return terms.slice(0, 10);
}
