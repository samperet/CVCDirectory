import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteBinary, enqueue, readJson, writeBinary, writeJson } from "@/lib/storage";
import { occurrences, snippetFor } from "@/lib/search";
import { DocumentConsent, DocumentRecord, DocumentVersion, Uploader } from "./types";
import { searchTerms } from "@/lib/search";

/**
 * Documents: details for all of them in one index, the searchable text of
 * each document's current version in another, and each version's file as its
 * own object (`documents/files/<id>/v<n>`).
 */

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

/** Change the index (and optionally the search text) together, under both write queues. */
async function mutate<T>(
  change: (
    documents: DocumentRecord[],
    texts: Record<string, string>
  ) =>
    | { documents: DocumentRecord[]; texts?: Record<string, string>; value: T }
    | "not_found"
    | "full"
): Promise<{ ok: true; value: T } | { ok: false; reason: "not_found" | "full" }> {
  return enqueue(INDEX, () =>
    enqueue(TEXT, async () => {
      const raw = (await readJson(INDEX)) as { textUpdatedAt?: string } | null;
      const documents = normalizeIndex(raw);
      const texts =
        ((await readJson(TEXT)) as { text?: Record<string, string> } | null)?.text ?? {};
      const outcome = change(documents, texts);
      if (typeof outcome === "string") return { ok: false as const, reason: outcome };
      const textUpdatedAt = outcome.texts ? new Date().toISOString() : raw?.textUpdatedAt ?? "";
      if (outcome.texts) await writeJson(TEXT, { text: outcome.texts });
      await writeJson(INDEX, { documents: outcome.documents, textUpdatedAt });
      return { ok: true as const, value: outcome.value };
    })
  );
}

export async function createDocument(
  circleId: string,
  details: DocumentDetails,
  file: {
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
    viewable: boolean;
    text: string;
  },
  uploader: Uploader
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const version: DocumentVersion = {
    number: 1,
    fileName: file.fileName,
    size: file.bytes.length,
    contentType: file.contentType,
    viewable: file.viewable,
    textChars: file.text.length,
    uploadedBy: uploader,
    uploadedAt: now,
  };
  await writeBinary(fileKey(id, 1), { bytes: file.bytes, contentType: file.contentType });
  const result = await mutate<DocumentRecord>((documents, texts) => {
    if (documents.length >= MAX_DOCUMENTS) return "full";
    const doc: DocumentRecord = {
      id,
      circleId,
      ...details,
      versions: [version],
      createdAt: now,
      updatedAt: now,
    };
    return { documents: [...documents, doc], texts: { ...texts, [id]: file.text }, value: doc };
  });
  if (!result.ok) await deleteBinary(fileKey(id, 1));
  return result;
}

/** Replace a document's file with a new version, keeping the old ones. */
export async function addVersion(
  id: string,
  file: {
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
    viewable: boolean;
    text: string;
  },
  uploader: Uploader
) {
  const existing = await getDocument(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  const number = Math.max(...existing.versions.map((version) => version.number)) + 1;
  await writeBinary(fileKey(id, number), { bytes: file.bytes, contentType: file.contentType });
  const now = new Date().toISOString();
  const result = await mutate<DocumentRecord>((documents, texts) => {
    const index = documents.findIndex((doc) => doc.id === id);
    if (index === -1) return "not_found";
    const version: DocumentVersion = {
      number,
      fileName: file.fileName,
      size: file.bytes.length,
      contentType: file.contentType,
      viewable: file.viewable,
      textChars: file.text.length,
      uploadedBy: uploader,
      uploadedAt: now,
    };
    const next = [...documents];
    next[index] = {
      ...documents[index],
      versions: [...documents[index].versions, version],
      updatedAt: now,
    };
    return { documents: next, texts: { ...texts, [id]: file.text }, value: next[index] };
  });
  if (!result.ok) await deleteBinary(fileKey(id, number));
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
  const result = await mutate<DocumentRecord>((documents, texts) => {
    const doc = documents.find((entry) => entry.id === id);
    if (!doc) return "not_found";
    const { [id]: _removed, ...rest } = texts;
    return { documents: documents.filter((entry) => entry.id !== id), texts: rest, value: doc };
  });
  if (result.ok)
    await Promise.all(
      result.value.versions.map((version) => deleteBinary(fileKey(id, version.number)))
    );
  return result;
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
