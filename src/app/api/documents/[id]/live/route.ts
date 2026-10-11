import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { canManageDocument } from "@/lib/documents/access";
import { getDocument, isDocumentId } from "@/lib/documents/store";
import { currentVersion, type DocumentRecord } from "@/lib/documents/types";
import { checkIn, editorsOf, type PageEditor } from "@/lib/wiki/presence";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Spreadsheets share the wiki's presence document, keyed apart from pages. */
const presenceKey = (id: string) => `file:${id}`;

async function load(id: string) {
  const context = await circleContext();
  if ("error" in context) return { error: context.error } as const;
  const doc = isDocumentId(id) ? await getDocument(id) : null;
  if (!doc) return { error: problem("Document not found", 404) } as const;
  return { ...context, doc } as const;
}

/** What an open spreadsheet checks every few seconds: its latest version, by whom, and who else has it open to edit. */
const state = (doc: DocumentRecord, editors: PageEditor[]) => {
  const latest = currentVersion(doc);
  return NextResponse.json(
    { version: latest.number, savedBy: latest.uploadedBy.name, editors },
    { headers: { "Cache-Control": "private, no-store" } }
  );
};

export async function GET(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  return state(found.doc, await editorsOf(presenceKey(found.doc.id)));
}

const checkInSchema = z.object({ editing: z.boolean() });

/** Someone who can change the file checking in as editing it (`editing: true`), or leaving (`false`, sent as the page closes). */
export async function POST(request: NextRequest, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  if (!canManageDocument(found.user, found.directory, found.doc))
    return problem("You can't change this document", 403);
  // Sent with sendBeacon as the page closes, so it may arrive as plain text.
  const parsed = checkInSchema.safeParse(
    await request
      .text()
      .then((text) => JSON.parse(text))
      .catch(() => null)
  );
  if (!parsed.success) return problem("Say whether you're editing");
  const editors = await checkIn(presenceKey(found.doc.id), found.actor, parsed.data.editing);
  return state(found.doc, editors);
}
