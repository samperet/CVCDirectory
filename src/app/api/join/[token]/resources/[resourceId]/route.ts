import { NextRequest, NextResponse } from "next/server";
import { fileKey, getDocument } from "@/lib/documents/store";
import { currentVersion } from "@/lib/documents/types";
import { notFound, problem, throttled } from "@/lib/http";
import { joinContext, onboardingProblem } from "@/lib/onboarding/http";
import { openToNewcomers, welcomeResources } from "@/lib/onboarding/resources";
import { linkExpired } from "@/lib/onboarding/shared";
import { contentDisposition, presignedDownloadUrl, readBinary } from "@/lib/storage";
import { getPageById } from "@/lib/wiki/store";

export const dynamic = "force-dynamic";

type Params = { params: { token: string; resourceId: string } };

/**
 * One of the welcome page's resources, opened from a new member's link
 * (before they can sign in): a document's current file, or a page's text
 * (`{ title, body }`). Only what the welcome page lists, and only while the
 * link works.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "join");
  if (limited) return limited;
  const ctx = await joinContext(params.token);
  if ("error" in ctx) return ctx.error;
  if (linkExpired(ctx.invitation)) return onboardingProblem("expired");
  const resource = (await welcomeResources()).find((entry) => entry.id === params.resourceId);
  if (!resource || resource.kind === "link") return notFound("Resource");

  if (resource.kind === "page") {
    const page = await getPageById(resource.pageId);
    if (!page || !openToNewcomers(page)) return notFound("Page");
    return NextResponse.json(
      { title: page.title, body: page.body, updatedAt: page.updatedAt },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const doc = await getDocument(resource.documentId);
  const version = doc ? currentVersion(doc) : null;
  if (!doc || !version) return notFound("Document");
  const key = fileKey(doc.id, version.number);
  const url = await presignedDownloadUrl(key, {
    fileName: version.fileName,
    contentType: version.contentType,
    inline: version.viewable,
  });
  if (url)
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  // Without R2 (local development), serve the file directly.
  const file = await readBinary(key);
  if (!file) return problem("File not found", 404);
  return new NextResponse(file.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": version.contentType,
      "Content-Disposition": contentDisposition(version.fileName, version.viewable),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
