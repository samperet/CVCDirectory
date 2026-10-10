import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteBinary, mutateJson, readJson, writeBinary } from "@/lib/storage";
import { occurrences, snippetFor } from "@/lib/search";
import { DocumentConsent, DocumentRecord, DocumentVersion, Uploader } from "./types";
import { searchTerms } from "@/lib/search";
import { differs } from "@/lib/proposals/mirror";

/**
 * Documents: details for all of them in one index, the searchable text of
 * each document's current version in another, and each version's file as its
 * own object (`documents/files/<id>/v<n>`) — or, for a link, nothing more.
 */

/** A new version's content: a file's bytes, or a link (no bytes). */
export interface VersionContent {
  bytes?: Uint8Array;
  fileName: string;
  contentType: string;
  viewable: boolean;
  text: string;
  link?: DocumentVersion["link"];
}

const versionOf = (
  number: number,
  content: VersionContent,
  uploader: Uploader,
  at: string
): DocumentVersion => ({
  number,
  fileName: content.fileName,
  size: content.bytes?.length ?? 0,
  contentType: content.contentType,
  viewable: content.viewable,
  textChars: content.text.length,
  uploadedBy: { userId: uploader.userId, personId: uploader.personId, name: uploader.name },
  uploadedAt: at,
  ...(content.link ? { link: content.link } : {}),
});

/** Store a version's file (links have none). */
const storeFile = (id: string, number: number, content: VersionContent) =>
  content.bytes
    ? writeBinary(fileKey(id, number), { bytes: content.bytes, contentType: content.contentType })
    : Promise.resolve();

const INDEX = "documents/index.json";
const TEXT = "documents/text.json";
const MAX_DOCUMENTS = 5000;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-29");
export const documentDetailsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the document a title")
    .max(160, "Keep the title to 160 characters"),
  description: z
    .string()
    .trim()
    .max(1000, "Keep the description to 1000 characters")
    .nullable()
    .optional()
    .transform((value) => value || null),
  type: z.string().regex(/^[a-z0-9-]{1,40}$/, "Choose a type"),
  meetingDate: isoDate
    .nullable()
    .optional()
    .transform((value) => value || null),
});
/** Details as saved: the type's current name is kept alongside its id. */
export type DocumentDetails = z.infer<typeof documentDetailsSchema> & { typeLabel?: string };

export const documentUpdateSchema = documentDetailsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const fileKey = (id: string, version: number) => `documents/files/${id}/v${version}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isDocumentId = (id: string) => UUID.test(id);

function normalizeIndex(raw: unknown): DocumentRecord[] {
  const documents = (raw as { documents?: unknown } | null)?.documents;
  return Array.isArray(documents) ? (documents as DocumentRecord[]) : [];
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return normalizeIndex(await readJson(INDEX));
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  return (await listDocuments()).find((doc) => doc.id === id) ?? null;
}

/*
 * Search text is one document for all files, cached per server instance and
 * reloaded whenever the index says it changed.
 */
let textCache: { stamp: string; text: Record<string, string> } | null = null;

async function readTexts(stamp: string): Promise<Record<string, string>> {
  if (textCache?.stamp === stamp) return textCache.text;
  const raw = (await readJson(TEXT)) as { text?: Record<string, string> } | null;
  textCache = { stamp, text: raw?.text ?? {} };
  return textCache.text;
}

async function textStamp(): Promise<string> {
  const raw = (await readJson(INDEX)) as { textUpdatedAt?: string } | null;
  return raw?.textUpdatedAt ?? "";
}

/** Every document's searchable text (its current version's), by its id. */
export async function getDocumentTexts(): Promise<Record<string, string>> {
  return readTexts(await textStamp());
}

/** A document's searchable text (its current version's), or "" if none was found in it. */
export async function getDocumentText(id: string): Promise<string> {
  return (await getDocumentTexts())[id] ?? "";
}

type Failure = "not_found" | "full" | "conflict";
type DocumentResult<T> = { ok: true; value: T } | { ok: false; reason: Failure };

/** Set (or, with null, drop) one document's search text. */
function writeText(id: string, value: string | null) {
  return mutateJson(TEXT, (raw) => {
    const { [id]: _old, ...rest } = (raw as { text?: Record<string, string> } | null)?.text ?? {};
    return { value: { text: value === null ? rest : { ...rest, [id]: value } }, result: null };
  });
}

/**
 * Change the index — with, when a file's text changes too, that text written
 * first and the index stamped (`textUpdatedAt`) so every instance's text
 * cache reloads. A text left behind by a failed index change is taken back.
 */
async function mutate<T>(
  change: (documents: DocumentRecord[]) => { documents: DocumentRecord[]; value: T } | Failure,
  text?: { id: string; value: string | null }
): Promise<DocumentResult<T>> {
  if (text) await writeText(text.id, text.value);
  const result = await mutateJson<DocumentResult<T>>(INDEX, (raw) => {
    const outcome = change(normalizeIndex(raw));
    if (typeof outcome === "string")
      return { write: false, result: { ok: false, reason: outcome } };
    const stamp = (raw as { textUpdatedAt?: string } | null)?.textUpdatedAt ?? "";
    return {
      value: {
        documents: outcome.documents,
        textUpdatedAt: text ? new Date().toISOString() : stamp,
      },
      result: { ok: true, value: outcome.value },
    };
  });
  if (text?.value !== null && text && !result.ok) await writeText(text.id, null);
  return result;
}

export async function createDocument(
  circleId: string,
  details: DocumentDetails,
  file: VersionContent,
  uploader: Uploader
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const version = versionOf(1, file, uploader, now);
  await storeFile(id, 1, file);
  const result = await mutate<DocumentRecord>(
    (documents) => {
      if (documents.length >= MAX_DOCUMENTS) return "full";
      const doc: DocumentRecord = {
        id,
        circleId,
        ...details,
        versions: [version],
        createdAt: now,
        updatedAt: now,
      };
      return { documents: [...documents, doc], value: doc };
    },
    { id, value: file.text }
  );
  if (!result.ok && file.bytes) await deleteBinary(fileKey(id, 1));
  return result;
}

/** Replace a document's file (or link) with a new version, keeping the old ones. */
export async function addVersion(id: string, file: VersionContent, uploader: Uploader) {
  const existing = await getDocument(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  const number = Math.max(...existing.versions.map((version) => version.number)) + 1;
  await storeFile(id, number, file);
  const now = new Date().toISOString();
  const result = await mutate<DocumentRecord>(
    (documents) => {
      const index = documents.findIndex((doc) => doc.id === id);
      if (index === -1) return "not_found";
      // Another upload took this version number first: this file is taken back.
      if (documents[index].versions.some((entry) => entry.number === number)) return "conflict";
      const version = versionOf(number, file, uploader, now);
      const next = [...documents];
      next[index] = {
        ...documents[index],
        versions: [...documents[index].versions, version],
        updatedAt: now,
      };
      return { documents: next, value: next[index] };
    },
    { id, value: file.text }
  );
  if (!result.ok && file.bytes) await deleteBinary(fileKey(id, number));
  return result;
}

export function updateDocument(id: string, update: Partial<DocumentDetails>) {
  return mutate<DocumentRecord>((documents) => {
    const index = documents.findIndex((doc) => doc.id === id);
    if (index === -1) return "not_found";
    const next = [...documents];
    next[index] = { ...documents[index], ...update, updatedAt: new Date().toISOString() };
    return { documents: next, value: next[index] };
  });
}

/** Record the circle's consent to a document (to its current version), or withdraw it (null). */
export function setConsent(id: string, consent: Omit<DocumentConsent, "version"> | null) {
  return mutate<DocumentRecord>((documents) => {
    const index = documents.findIndex((doc) => doc.id === id);
    if (index === -1) return "not_found";
    const doc = documents[index];
    const next = [...documents];
    next[index] = {
      ...doc,
      consent: consent
        ? { ...consent, version: doc.versions[doc.versions.length - 1].number }
        : null,
    };
    return { documents: next, value: next[index] };
  });
}

/** Delete a document and every version of its file. */
export async function deleteDocument(id: string) {
  const result = await mutate<DocumentRecord>(
    (documents) => {
      const doc = documents.find((entry) => entry.id === id);
      if (!doc) return "not_found";
      return { documents: documents.filter((entry) => entry.id !== id), value: doc };
    },
    { id, value: null }
  );
  if (result.ok)
    await Promise.all(
      result.value.versions
        .filter((version) => !version.link)
        .map((version) => deleteBinary(fileKey(id, version.number)))
    );
  return result;
}

/**
 * Copy where proposals stand onto the documents they're about (`decide`
 * says what each should show; see `lib/proposals/mirror.ts`). Documents
 * that already show it aren't rewritten.
 */
export async function setDocumentDecisions(
  ids: string[],
  decide: (doc: DocumentRecord) => Pick<DocumentRecord, "proposal" | "consent">
) {
  const wanted = new Set(ids);
  const stale = (doc: DocumentRecord) => {
    if (!wanted.has(doc.id)) return null;
    const next = decide(doc);
    return differs(doc.proposal, next.proposal) || differs(doc.consent, next.consent) ? next : null;
  };
  if (!(await listDocuments()).some(stale)) return;
  await mutate<null>((documents) => ({
    documents: documents.map((doc) => {
      const next = stale(doc);
      return next ? { ...doc, proposal: next.proposal, consent: next.consent } : doc;
    }),
    value: null,
  }));
}

/** When a circle is deleted, its documents become the Board's (community-wide) rather than disappearing. */
export function moveCircleDocuments(fromCircleId: string, toCircleId: string) {
  return mutate<number>((documents) => {
    let moved = 0;
    const next = documents.map((doc) =>
      doc.circleId === fromCircleId ? (moved++, { ...doc, circleId: toCircleId }) : doc
    );
    return { documents: next, value: moved };
  });
}

export interface SearchHit {
  doc: DocumentRecord;
  score: number;
  snippet: string | null;
}

/**
 * Documents matching every term of the query, in their details or their
 * text, best first. `labels` supplies extra searchable words per document
 * (its circle's name, its type).
 */
export async function searchDocuments(
  documents: DocumentRecord[],
  query: string,
  labels: (doc: DocumentRecord) => string
): Promise<SearchHit[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const texts = await readTexts(await textStamp());
  const hits: SearchHit[] = [];
  for (const doc of documents) {
    const title = doc.title.toLowerCase();
    const details = [
      doc.description ?? "",
      labels(doc),
      doc.versions.map((version) => `${version.fileName} ${version.uploadedBy.name}`).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    const text = texts[doc.id] ?? "";
    const lowerText = text.toLowerCase();
    let score = 0;
    let all = true;
    for (const term of terms) {
      const inTitle = occurrences(title, term);
      const inDetails = occurrences(details, term);
      const inText = occurrences(lowerText, term);
      if (!inTitle && !inDetails && !inText) {
        all = false;
        break;
      }
      score += inTitle * 20 + inDetails * 5 + Math.min(inText, 20);
    }
    if (all) hits.push({ doc, score, snippet: snippetFor(text, terms) });
  }
  return hits.sort((a, b) => b.score - a.score);
}
