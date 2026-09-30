import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { deleteBinary, readBinary } from "@/lib/storage";
import { canManageDocument, canUploadTo, toListing } from "@/lib/documents/access";
import { extractText, identifyDocument } from "@/lib/documents/files";
import { addVersion, createDocument, documentDetailsSchema, getDocument, listDocuments, searchDocuments } from "@/lib/documents/store";
import { DocumentRecord, consentState, documentDate } from "@/lib/documents/types";
import { readTypeMap, typeLabelFor, typesFor } from "@/lib/documents/type-store";
import { chunkCount, chunkKey, readUploadToken } from "@/lib/documents/upload-token";
import { notify } from "@/lib/push/notify";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";
// Finishing an upload reassembles the file and reads its text, which can take a while for a large PDF.
export const maxDuration = 60;

/**
 * List documents, newest first — or, with `q`, search their details and
 * contents, best match first. Filters: `circle`, `type` (a type's name,
 * since each circle names its own types), and `consented=1` (only documents
 * whose current version the circle has consented to). Also returns the type names in use,
 * for the type filter.
 */
export async function GET(request: NextRequest) {
  const context = await circleContext();
  if ("error" in context) return context.error;
  const { user, directory } = context;
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const circle = params.get("circle");
  const type = params.get("type");
  const consentedOnly = params.get("consented") === "1";
  const types = await readTypeMap();
  const label = (doc: DocumentRecord) => typeLabelFor(doc, types);

  const inCircle = (await listDocuments()).filter((doc) => !circle || doc.circleId === circle);
  const typeOptions = Array.from(new Set(inCircle.map(label))).sort((a, b) => a.localeCompare(b));
  const documents = inCircle
    .filter((doc) => !type || label(doc).toLowerCase() === type.toLowerCase())
    .filter((doc) => !consentedOnly || consentState(doc) === "consented");
  const circleName = (doc: DocumentRecord) => directory.circles.find((entry) => entry.id === doc.circleId)?.name ?? "";

  if (q) {
    const hits = await searchDocuments(documents, q, (doc) => `${circleName(doc)} ${label(doc)}${consentState(doc) === "consented" ? " consented" : ""}`);
    return NextResponse.json(
      { documents: hits.slice(0, 100).map((hit) => toListing(hit.doc, user, directory, types, hit.snippet)), total: hits.length, typeOptions },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const sorted = [...documents].sort((a, b) => documentDate(b).localeCompare(documentDate(a)) || b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json(
    { documents: sorted.map((doc) => toListing(doc, user, directory, types)), total: sorted.length, typeOptions },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const finishSchema = z.object({
  token: z.string().min(10).max(4000),
  details: documentDetailsSchema.optional(),
});

/** Finish an upload: reassemble the pieces, check the file, read its text, and save it (as a new document or version). */
export async function POST(request: NextRequest) {
  const context = await circleContext();
  if ("error" in context) return context.error;
  const { user, directory } = context;
  const parsed = finishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const grant = readUploadToken(parsed.data.token, user.id);
  if (!grant) return problem("This upload has expired — please start again", 403, "Forbidden");

  const count = chunkCount(grant.size);
  const keys = Array.from({ length: count }, (_, index) => chunkKey(grant.uploadId, index));
  const cleanUp = () => Promise.all(keys.map((key) => deleteBinary(key).catch(() => undefined)));
  const pieces = await Promise.all(keys.map((key) => readBinary(key)));
  if (pieces.some((piece) => !piece)) return problem("Part of the file didn't arrive — please upload it again");
  const bytes = new Uint8Array(grant.size);
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece!.bytes, offset);
    offset += piece!.bytes.length;
  }
  if (offset !== grant.size) {
    await cleanUp();
    return problem("The file didn't arrive intact — please upload it again");
  }

  const identified = identifyDocument(bytes, grant.fileName);
  if (!identified) {
    await cleanUp();
    return problem("That file isn't a PDF, Word, Excel, PowerPoint, text, or image file we can accept", 415, "Unsupported Media Type");
  }
  const text = await extractText(bytes, identified.kind);
  const file = { bytes, fileName: grant.fileName, contentType: identified.contentType, viewable: identified.viewable, text };
  const uploader = { userId: user.id, personId: user.personId ?? null, name: user.name };

  let result;
  if (grant.replaces) {
    const existing = await getDocument(grant.replaces);
    if (!existing || !canManageDocument(user, directory, existing)) {
      await cleanUp();
      return problem("You can't replace this document", 403, "Forbidden");
    }
    result = await addVersion(grant.replaces, file, uploader);
  } else {
    if (!parsed.data.details) return problem("Give the document a title and type");
    if (!canUploadTo(user, directory, grant.circleId)) {
      await cleanUp();
      return problem("Only this circle's members, the Board, and admins can add its documents", 403, "Forbidden");
    }
    const option = typesFor(grant.circleId, await readTypeMap()).find((entry) => entry.id === parsed.data.details!.type);
    if (!option) return problem("Choose one of this circle's document types");
    result = await createDocument(grant.circleId, { ...parsed.data.details, typeLabel: option.label }, file, uploader);
  }
  await cleanUp();
  if (!result.ok) return problem(result.reason === "full" ? "The document library is full" : "That document no longer exists", 409, "Conflict");

  const doc = result.value;
  const circleName = directory.circles.find((entry) => entry.id === doc.circleId)?.name ?? "the Board";
  const typeName = typeLabelFor(doc, await readTypeMap());
  const kind = doc.type === "other" ? "document" : typeName.toLowerCase();
  await notify({
    topic: "documents",
    title: grant.replaces ? `Updated in ${circleName}: ${doc.title}` : `New ${kind} in ${circleName}: ${doc.title}`,
    body: `${user.name} ${grant.replaces ? "uploaded a new version" : "added it"}${doc.meetingDate ? ` · meeting ${doc.meetingDate}` : ""}`,
    url: `/circles/${doc.circleId}#documents`,
    tag: `document-${doc.id}`,
    exceptUserId: user.id,
  });
  return NextResponse.json({ document: toListing(doc, user, directory, await readTypeMap()) }, { status: grant.replaces ? 200 : 201 });
}

