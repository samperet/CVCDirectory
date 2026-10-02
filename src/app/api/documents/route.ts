import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { actorOf } from "@/lib/auth/actor";
import { deleteBinary, readBinary } from "@/lib/storage";
import { canManageDocument, canUploadTo, toListing } from "@/lib/documents/access";
import { extractText, identifyDocument } from "@/lib/documents/files";
import {
  addVersion,
  createDocument,
  documentDetailsSchema,
  getDocument,
  listDocuments,
  searchDocuments,
} from "@/lib/documents/store";
import { DocumentRecord, consentState, documentDate } from "@/lib/documents/types";
import { readTypeMap, typeLabelFor, typesFor } from "@/lib/documents/type-store";
import { chunkCount, chunkKey, readUploadToken } from "@/lib/documents/upload-token";
import { notify } from "@/lib/push/notify";
import { readPages, type WikiPage } from "@/lib/wiki/store";
import { visiblePages } from "@/lib/wiki/access";
import { consentState as pageConsentState } from "@/lib/wiki/consent";
import { pageDate, pageListing, searchPages } from "@/lib/wiki/listing";
import { searchTerms } from "@/lib/search";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";
// Finishing an upload reassembles the file and reads its text, which can take a while for a large PDF.
export const maxDuration = 60;

/** What every listed item — an uploaded file or a written page — is sorted by. */
type Sortable = { date: string; createdAt: string; title: string; updatedAt: string };

/** How a list can be ordered (search results are best match first unless one is chosen). */
const SORTS = {
  newest: (a: Sortable, b: Sortable) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  oldest: (a: Sortable, b: Sortable) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  title: (a: Sortable, b: Sortable) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
  updated: (a: Sortable, b: Sortable) => b.updatedAt.localeCompare(a.updatedAt),
} as const;
type Sort = keyof typeof SORTS;

const fileSortable = (doc: DocumentRecord): Sortable => ({
  date: documentDate(doc),
  createdAt: doc.createdAt,
  title: doc.title,
  updatedAt: doc.updatedAt,
});
const pageSortable = (page: WikiPage): Sortable => ({
  date: pageDate(page),
  createdAt: page.createdAt,
  title: page.title,
  updatedAt: page.updatedAt,
});

/**
 * List documents, newest first — or, with `q`, search their details and
 * contents, best match first. Filters: `circle`, `type` (a type's name,
 * since each circle names its own types), `year` (of the meeting, or the
 * upload), and `consented=1` (only documents whose current version the circle
 * has consented to). `sort`: newest, oldest, title, or updated. Also returns
 * the type names and years in use, for the filters.
 *
 * With `pages=1` the written pages someone can see come too, as one list
 * (`items`: each `kind` "file" or "page") filtered, searched and sorted
 * alike; `kind=pages` or `kind=files` keeps to one (choosing a file `type`
 * means files). `documents` stays the files alone.
 */
export async function GET(request: NextRequest) {
  const context = await circleContext();
  if ("error" in context) return context.error;
  const { user, directory } = context;
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const circle = params.get("circle");
  const type = params.get("type");
  const year = params.get("year");
  const consentedOnly = params.get("consented") === "1";
  const withPages = params.get("pages") === "1";
  const kind = params.get("kind");
  const sortParam = params.get("sort");
  const sort: Sort | null = sortParam && sortParam in SORTS ? (sortParam as Sort) : null;
  const types = await readTypeMap();
  const label = (doc: DocumentRecord) => typeLabelFor(doc, types);
  const circleName = (id: string) => directory.circles.find((entry) => entry.id === id)?.name ?? "";

  const inCircle = (await listDocuments()).filter((doc) => !circle || doc.circleId === circle);
  const pagesInCircle = withPages
    ? visiblePages(user, directory, await readPages()).filter(
        (page) => !circle || page.keeper === circle
      )
    : [];
  const typeOptions = Array.from(new Set(inCircle.map(label))).sort((a, b) => a.localeCompare(b));
  const yearOptions = Array.from(
    new Set([
      ...inCircle.map((doc) => documentDate(doc).slice(0, 4)),
      ...pagesInCircle.map((page) => pageDate(page).slice(0, 4)),
    ])
  ).sort((a, b) => b.localeCompare(a));
  const showFiles = kind !== "pages";
  const showPages = withPages && kind !== "files" && !type;
  const documents = (showFiles ? inCircle : [])
    .filter((doc) => !type || label(doc).toLowerCase() === type.toLowerCase())
    .filter((doc) => !year || documentDate(doc).startsWith(`${year}-`))
    .filter((doc) => !consentedOnly || consentState(doc) === "consented");
  const pages = (showPages ? pagesInCircle : [])
    .filter((page) => !year || pageDate(page).startsWith(`${year}-`))
    .filter((page) => !consentedOnly || pageConsentState(page) === "consented");
  const options = { typeOptions, yearOptions, hasPages: pagesInCircle.length > 0 };
  const headers = { "Cache-Control": "private, no-store" };

  type Item = { sortable: Sortable; score: number; listing: () => object };
  const fileItem = (doc: DocumentRecord, score = 0, snippet?: string | null): Item => ({
    sortable: fileSortable(doc),
    score,
    listing: () => ({ kind: "file", ...toListing(doc, user, directory, types, snippet) }),
  });
  const pageItem = (page: WikiPage, score = 0, snippet?: string | null): Item => ({
    sortable: pageSortable(page),
    score,
    listing: () => pageListing(page, circleName(page.keeper), snippet),
  });

  if (q) {
    const found = await searchDocuments(
      documents,
      q,
      (doc) =>
        `${circleName(doc.circleId)} ${label(doc)}${
          consentState(doc) === "consented" ? " consented" : ""
        }`
    );
    const foundPages = searchPages(
      pages,
      searchTerms(q),
      (page) =>
        `${circleName(page.keeper)} page${
          pageConsentState(page) === "consented" ? " consented" : ""
        }`
    );
    const hits = sort
      ? [...found].sort((a, b) => SORTS[sort](fileSortable(a.doc), fileSortable(b.doc)))
      : found;
    const items = [
      ...found.map((hit) => fileItem(hit.doc, hit.score, hit.snippet)),
      ...foundPages.map((hit) => pageItem(hit.page, hit.score, hit.snippet)),
    ].sort((a, b) => (sort ? SORTS[sort](a.sortable, b.sortable) : b.score - a.score));
    return NextResponse.json(
      {
        documents: hits
          .slice(0, 100)
          .map((hit) => toListing(hit.doc, user, directory, types, hit.snippet)),
        ...(withPages
          ? { items: items.slice(0, 100).map((item) => item.listing()), total: items.length }
          : { total: hits.length }),
        ...options,
      },
      { headers }
    );
  }
  const sorted = [...documents].sort((a, b) =>
    SORTS[sort ?? "newest"](fileSortable(a), fileSortable(b))
  );
  const items = withPages
    ? [...sorted.map((doc) => fileItem(doc)), ...pages.map((page) => pageItem(page))].sort((a, b) =>
        SORTS[sort ?? "newest"](a.sortable, b.sortable)
      )
    : [];
  return NextResponse.json(
    {
      documents: sorted.map((doc) => toListing(doc, user, directory, types)),
      ...(withPages
        ? { items: items.map((item) => item.listing()), total: items.length }
        : { total: sorted.length }),
      ...options,
    },
    { headers }
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
  const parsed = await readBody(request, finishSchema);
  if ("error" in parsed) return parsed.error;
  const grant = readUploadToken(parsed.data.token, user.id);
  if (!grant) return problem("This upload has expired — please start again", 403);

  const count = chunkCount(grant.size);
  const keys = Array.from({ length: count }, (_, index) => chunkKey(grant.uploadId, index));
  const cleanUp = () => Promise.all(keys.map((key) => deleteBinary(key).catch(() => undefined)));
  const pieces = await Promise.all(keys.map((key) => readBinary(key)));
  if (pieces.some((piece) => !piece))
    return problem("Part of the file didn't arrive — please upload it again");
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
    return problem(
      "That file isn't a PDF, Word, Excel, PowerPoint, text, or image file we can accept",
      415
    );
  }
  const text = await extractText(bytes, identified.kind);
  const file = {
    bytes,
    fileName: grant.fileName,
    contentType: identified.contentType,
    viewable: identified.viewable,
    text,
  };
  const uploader = actorOf(user);

  let result;
  if (grant.replaces) {
    const existing = await getDocument(grant.replaces);
    if (!existing || !canManageDocument(user, directory, existing)) {
      await cleanUp();
      return problem("You can't replace this document", 403);
    }
    result = await addVersion(grant.replaces, file, uploader);
  } else {
    if (!parsed.data.details) return problem("Give the document a title and type");
    if (!canUploadTo(user, directory, grant.circleId)) {
      await cleanUp();
      return problem(
        "Only this circle's members, the Board, and admins can add its documents",
        403
      );
    }
    const option = typesFor(grant.circleId, await readTypeMap()).find(
      (entry) => entry.id === parsed.data.details!.type
    );
    if (!option) return problem("Choose one of this circle's document types");
    result = await createDocument(
      grant.circleId,
      { ...parsed.data.details, typeLabel: option.label },
      file,
      uploader
    );
  }
  await cleanUp();
  if (!result.ok)
    return problem(
      result.reason === "full"
        ? "The document library is full"
        : result.reason === "conflict"
          ? "Someone else uploaded a new version at the same moment — try again"
          : "That document no longer exists",
      409
    );

  const doc = result.value;
  const circleName =
    directory.circles.find((entry) => entry.id === doc.circleId)?.name ?? "the Board";
  const typeName = typeLabelFor(doc, await readTypeMap());
  const kind = doc.type === "other" ? "document" : typeName.toLowerCase();
  await notify({
    topic: "documents",
    title: grant.replaces
      ? `Updated in ${circleName}: ${doc.title}`
      : `New ${kind} in ${circleName}: ${doc.title}`,
    body: `${user.name} ${grant.replaces ? "uploaded a new version" : "added it"}${
      doc.meetingDate ? ` · meeting ${doc.meetingDate}` : ""
    }`,
    url: `/circles/${doc.circleId}#documents`,
    tag: `document-${doc.id}`,
    exceptUserId: user.id,
  });
  return NextResponse.json(
    { document: toListing(doc, user, directory, await readTypeMap()) },
    { status: grant.replaces ? 200 : 201 }
  );
}
