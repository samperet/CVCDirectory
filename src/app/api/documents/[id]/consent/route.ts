import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { canConsentDocument, toListing } from "@/lib/documents/access";
import { getDocument, isDocumentId, setConsent } from "@/lib/documents/store";
import { readTypeMap } from "@/lib/documents/type-store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function load(id: string) {
  const context = await circleContext();
  if ("error" in context) return { error: context.error } as const;
  const doc = isDocumentId(id) ? await getDocument(id) : null;
  if (!doc) return { error: problem("Document not found", 404) } as const;
  if (!canConsentDocument(context.user, context.directory, doc)) {
    return {
      error: problem("Only the circle's members and the Board can record its consent", 403),
    } as const;
  }
  return { ...context, doc } as const;
}

/** Consent is recorded through a proposal, at a meeting (`/api/proposals`), not on the document. */
export async function PUT() {
  return problem(
    "Consent is recorded at a meeting now, through a proposal — use Record consent",
    410
  );
}

/** Withdraw a record of consent from before proposals (one from a proposal is withdrawn there). */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  if (found.doc.consent?.proposalId)
    return problem("This consent came through a proposal — withdraw it there", 409);
  const result = await setConsent(found.doc.id, null);
  if (!result.ok) return problem("Document not found", 404);
  return NextResponse.json({
    document: toListing(result.value, found.user, found.directory, await readTypeMap()),
  });
}
