import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { canManageDocument, toListing } from "@/lib/documents/access";
import { deleteDocument, documentUpdateSchema, getDocument, isDocumentId, updateDocument } from "@/lib/documents/store";
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
  return NextResponse.json({ document: toListing(found.doc, found.user, found.directory) });
}

/** Edit a document's title, description, type, or meeting date. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  if (!canManageDocument(found.user, found.directory, found.doc)) return problem("You can't edit this document", 403, "Forbidden");
  const parsed = documentUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const result = await updateDocument(found.doc.id, parsed.data);
  if (!result.ok) return problem("Document not found", 404, "Not Found");
  return NextResponse.json({ document: toListing(result.value, found.user, found.directory) });
}

/** Delete a document and all its versions. */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  if (!canManageDocument(found.user, found.directory, found.doc)) return problem("You can't delete this document", 403, "Forbidden");
  const result = await deleteDocument(found.doc.id);
  if (!result.ok) return problem("Document not found", 404, "Not Found");
  return NextResponse.json({ ok: true });
}
