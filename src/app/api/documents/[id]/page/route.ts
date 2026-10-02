import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { canUploadTo } from "@/lib/documents/access";
import { identifyDocument } from "@/lib/documents/files";
import { fileKey, getDocument, isDocumentId } from "@/lib/documents/store";
import { fileToMarkdown } from "@/lib/documents/to-markdown";
import { currentVersion } from "@/lib/documents/types";
import { readBinary } from "@/lib/storage";
import { createPage } from "@/lib/wiki/store";
import { wikiProblem } from "@/lib/wiki/http";
import { problem, throttled } from "@/lib/http";
import { shortDate } from "@/lib/time";

export const dynamic = "force-dynamic";
// Reading a large file's text can take a while.
export const maxDuration = 60;

type Params = { params: { id: string } };

/**
 * Turn an uploaded file into a written page: its text (a Word file's
 * headings, bold, italics, and lists too) becomes a new page with the
 * file's title, kept by the file's circle, opening with a link back to the
 * file — which stays as it is. Anyone who can start pages for that circle.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "document-to-page");
  if (limited) return limited;
  const context = await circleContext();
  if ("error" in context) return context.error;
  const doc = isDocumentId(params.id) ? await getDocument(params.id) : null;
  if (!doc) return problem("Document not found", 404);
  if (!canUploadTo(context.user, context.directory, doc.circleId))
    return problem("Only the circle's members can turn its files into pages", 403);
  const version = currentVersion(doc);
  const file = await readBinary(fileKey(doc.id, version.number));
  if (!file) return problem("The file is missing", 404);
  const identified = identifyDocument(file.bytes, version.fileName);
  if (!identified) return problem("That kind of file can't be turned into a page", 422);
  const text = await fileToMarkdown(file.bytes, identified.kind, version.fileName);
  if (!text.trim())
    return problem(
      "There's no text in this file to bring in (a scan or a photo, say, or an old Office format)",
      422
    );
  const body = `*Made from the file [[doc:${doc.title}]], uploaded ${shortDate(
    version.uploadedAt,
    true
  )}.*\n\n${text}`;
  const result = await createPage(context.actor, {
    title: doc.title,
    body: body.slice(0, 50_000),
    keeper: doc.circleId,
  });
  if (!result.ok)
    return result.reason === "exists"
      ? problem(`There's already a page called “${doc.title}”`, 409)
      : wikiProblem(result.reason);
  return NextResponse.json(
    { page: result.page ? { slug: result.page.slug, title: result.page.title } : null },
    { status: 201 }
  );
}
