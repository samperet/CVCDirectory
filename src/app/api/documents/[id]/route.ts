import { NextRequest, NextResponse } from "next/server";
import { removePinsOn } from "@/lib/pins/store";
import { circleContext } from "@/lib/circles/access";
import { canManageDocument, toListing } from "@/lib/documents/access";
import { deleteDocument, documentUpdateSchema, getDocument, isDocumentId, updateDocument } from "@/lib/documents/store";
import { readTypeMap, typesFor } from "@/lib/documents/type-store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function load(id: string) {
  const context = await circleContext();
  if ("error" in context) return { error: context.error } as const;
  const doc = isDocumentId(id) ? await getDocument(id) : null;
  if (!doc) return { error: problem("Document not found", 404, "Not Found") } as const;
  return { ...context, doc } as const;
}

export async function GET(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  return NextResponse.json({ document: toListing(found.doc, found.user, found.directory, await readTypeMap()) });
}

/** Edit a document's title, description, type, or meeting date. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  if (!canManageDocument(found.user, found.directory, found.doc)) return problem("You can't edit this document", 403, "Forbidden");
  const parsed = documentUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const types = await readTypeMap();
  let update: typeof parsed.data & { typeLabel?: string } = parsed.data;
  if (parsed.data.type && parsed.data.type !== found.doc.type) {
    // A document may keep a type its circle has since removed, but can only move to a current one.
    const option = typesFor(found.doc.circleId, types).find((entry) => entry.id === parsed.data.type);
    if (!option) return problem("Choose one of this circle's document types");
    update = { ...parsed.data, typeLabel: option.label };
  }
  const result = await updateDocument(found.doc.id, update);
  if (!result.ok) return problem("Document not found", 404, "Not Found");
  return NextResponse.json({ document: toListing(result.value, found.user, found.directory, types) });
}

/** Delete a document and all its versions. */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  if (!canManageDocument(found.user, found.directory, found.doc)) return problem("You can't delete this document", 403, "Forbidden");
  const result = await deleteDocument(found.doc.id);
  if (!result.ok) return problem("Document not found", 404, "Not Found");
  await removePinsOn({ kind: "document", id: found.doc.id });
  return NextResponse.json({ ok: true });
}
