import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { actorOf } from "@/lib/auth/actor";
import { canManageDocument, canUploadTo, toListing } from "@/lib/documents/access";
import { announceDocument } from "@/lib/documents/announce";
import { readGoogleText } from "@/lib/documents/link-fetch";
import {
  LINK_CONTENT_TYPE,
  classifyLink,
  linkName,
  readableKinds,
  type LinkInfo,
} from "@/lib/documents/links";
import {
  addVersion,
  createDocument,
  documentDetailsSchema,
  getDocument,
} from "@/lib/documents/store";
import { readTypeMap, typesFor } from "@/lib/documents/type-store";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Documents that are links: a Google Doc, Sheet or Slides deck, a Form, a
 * Drive file, or any web page. GET `?url=` says what a link is before it's
 * saved — for a Google file, its title and whether it's shared with anyone
 * who has the link (residents can't open it otherwise). POST saves it, as a
 * new document of a circle or (`replaces`) a new version of one; a shared
 * Google file's text is read so search finds what's in it.
 */

const urlSchema = z.string().trim().min(4, "Paste a link").max(2000, "That link is too long");

async function inspect(info: LinkInfo) {
  const read = readableKinds.includes(info.kind) ? await readGoogleText(info) : null;
  return {
    kind: info.kind,
    url: info.url,
    previewUrl: info.previewUrl ?? null,
    title: read?.title ?? null,
    // Unknown (null) for links we don't read.
    shared: read ? read.shared : null,
    text: read?.text ?? "",
  };
}

export async function GET(request: NextRequest) {
  const limited = throttled(request, "document-link-check");
  if (limited) return limited;
  const context = await circleContext();
  if ("error" in context) return context.error;
  const parsed = urlSchema.safeParse(request.nextUrl.searchParams.get("url") ?? "");
  if (!parsed.success) return problem("Paste a link");
  const info = classifyLink(parsed.data);
  if (!info) return problem("That doesn't look like a web address");
  const { text, ...found } = await inspect(info);
  return NextResponse.json(
    { ...found, searchable: text.length > 0 },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const saveSchema = z.object({
  url: urlSchema,
  circleId: z.string().min(1).max(40).optional(),
  details: documentDetailsSchema.optional(),
  replaces: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const limited = throttled(request, "document-link");
  if (limited) return limited;
  const context = await circleContext();
  if ("error" in context) return context.error;
  const { user, directory } = context;
  const parsed = await readBody(request, saveSchema);
  if ("error" in parsed) return parsed.error;
  const info = classifyLink(parsed.data.url);
  if (!info) return problem("That doesn't look like a web address");

  const existing = parsed.data.replaces ? await getDocument(parsed.data.replaces) : null;
  if (parsed.data.replaces) {
    if (!existing) return problem("That document no longer exists", 404);
    if (!canManageDocument(user, directory, existing))
      return problem("You can't change this document", 403);
  } else {
    const circleId = parsed.data.circleId;
    const circle = directory.circles.find((entry) => entry.id === circleId);
    if (!circleId || !circle) return problem("Circle not found", 404);
    if (!featureEnabled(circle, "documents"))
      return problem(`${circle.name} has turned documents off`, 409);
    if (!canUploadTo(user, directory, circleId))
      return problem(
        "Only this circle's members, the Board, and admins can add its documents",
        403
      );
    if (!parsed.data.details) return problem("Give the document a title and type");
  }

  const found = await inspect(info);
  const content = {
    fileName: linkName(info),
    contentType: LINK_CONTENT_TYPE,
    viewable: true,
    text: found.text,
    link: { url: info.url, kind: info.kind },
  };
  let result;
  if (existing) {
    result = await addVersion(existing.id, content, actorOf(user));
  } else {
    const circleId = parsed.data.circleId!;
    const details = parsed.data.details!;
    const option = typesFor(circleId, await readTypeMap()).find(
      (entry) => entry.id === details.type
    );
    if (!option) return problem("Choose one of this circle's document types");
    result = await createDocument(
      circleId,
      { ...details, typeLabel: option.label },
      content,
      actorOf(user)
    );
  }
  if (!result.ok)
    return problem(
      result.reason === "full"
        ? "The document library is full"
        : result.reason === "conflict"
          ? "Someone else changed it at the same moment — try again"
          : "That document no longer exists",
      409
    );
  await announceDocument(result.value, user, directory, !!existing);
  return NextResponse.json(
    {
      document: toListing(result.value, user, directory, await readTypeMap()),
      shared: found.shared,
    },
    { status: existing ? 200 : 201 }
  );
}
