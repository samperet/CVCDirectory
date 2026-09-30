import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { canConsentDocument, toListing } from "@/lib/documents/access";
import { getDocument, isDocumentId, setConsent } from "@/lib/documents/store";
import { readTypeMap } from "@/lib/documents/type-store";
import { todayInVermont } from "@/lib/tasks/shared";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const consentSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-03")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00Z`)), "That isn't a date")
    .optional(),
});

async function load(id: string) {
  const context = await circleContext();
  if ("error" in context) return { error: context.error } as const;
  const doc = isDocumentId(id) ? await getDocument(id) : null;
  if (!doc) return { error: problem("Document not found", 404, "Not Found") } as const;
  if (!canConsentDocument(context.user, context.directory, doc)) {
    return { error: problem("Only the circle's Secretary, the Board Secretary, and admins can record consent", 403, "Forbidden") } as const;
  }
  return { ...context, doc } as const;
}

/** Record that the circle consented to this document (its current version), on `date` (default: today). */
export async function PUT(request: NextRequest, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  const parsed = consentSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));
  const today = todayInVermont();
  const date = parsed.data.date ?? today;
  if (date > today) return problem("Consent can't be dated in the future");
  const result = await setConsent(found.doc.id, {
    date,
    recordedBy: { personId: found.user.personId ?? null, name: found.user.name },
    recordedAt: new Date().toISOString(),
  });
  if (!result.ok) return problem("Document not found", 404, "Not Found");
  return NextResponse.json({ document: toListing(result.value, found.user, found.directory, await readTypeMap()) });
}

/** Withdraw the record of consent. */
export async function DELETE(_request: Request, { params }: Params) {
  const found = await load(params.id);
  if ("error" in found) return found.error;
  const result = await setConsent(found.doc.id, null);
  if (!result.ok) return problem("Document not found", 404, "Not Found");
  return NextResponse.json({ document: toListing(result.value, found.user, found.directory, await readTypeMap()) });
}
