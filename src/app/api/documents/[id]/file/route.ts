import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { contentDisposition, presignedDownloadUrl, readBinary } from "@/lib/storage";
import { fileKey, getDocument, isDocumentId } from "@/lib/documents/store";
import { currentVersion } from "@/lib/documents/types";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Open or download a document (`?v=` for an earlier version, `?download=1`
 * to save rather than view). Files come straight from storage through a
 * link that works for five minutes, so size is no limit; PDFs, images, and
 * text open in the browser, everything else downloads.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to open documents", 401);
  const doc = isDocumentId(params.id) ? await getDocument(params.id) : null;
  if (!doc) return problem("Document not found", 404);

  const wanted = Number(request.nextUrl.searchParams.get("v"));
  const version = wanted ? doc.versions.find((entry) => entry.number === wanted) : currentVersion(doc);
  if (!version) return problem("That version doesn't exist", 404);
  const inline = version.viewable && request.nextUrl.searchParams.get("download") !== "1";
  const key = fileKey(doc.id, version.number);

  const url = await presignedDownloadUrl(key, { fileName: version.fileName, contentType: version.contentType, inline });
  if (url) return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });

  // Without R2 (local development), serve the file directly.
  const file = await readBinary(key);
  if (!file) return problem("File not found", 404);
  return new NextResponse(file.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": version.contentType,
      "Content-Disposition": contentDisposition(version.fileName, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
