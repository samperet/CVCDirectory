import { isAdmin } from "@/lib/auth/admins";
import { canManageCircle } from "@/lib/circles/icons";
import { canRecordConsent } from "@/lib/circles/consent";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { DocumentListing, DocumentRecord, DocumentTypeOption } from "./types";
import { typeLabelFor } from "./type-store";
import { isCommunity } from "@/lib/circles/ids";

/**
 * Every signed-in resident can see and search every document. A circle's
 * members, the Board, and admins upload to it (any resident, for the
 * Community circle); whoever uploaded a document
 * can also edit, replace, or delete it.
 */

type Viewer = { personId?: string | null };

export function canUploadTo(user: Viewer, directory: DirectoryDocument, circleId: string) {
  // Everyone is in the Community circle, so any resident can add its documents.
  if (isCommunity(circleId) && user.personId) return true;
  return isAdmin(user) || (!!user.personId && canManageCircle(directory, circleId, user.personId));
}

export function canManageDocument(user: Viewer, directory: DirectoryDocument, doc: DocumentRecord) {
  return (
    canUploadTo(user, directory, doc.circleId) ||
    (!!user.personId && doc.versions[0]?.uploadedBy.personId === user.personId)
  );
}

/** Record or withdraw consent to a document: anyone in its circle, the Board, or an admin (`canRecordConsent`). */
export function canConsentDocument(
  user: Viewer,
  directory: DirectoryDocument,
  doc: Pick<DocumentRecord, "circleId">
) {
  return canRecordConsent(user, directory, doc.circleId);
}

export function toListing(
  doc: DocumentRecord,
  user: Viewer,
  directory: DirectoryDocument,
  types: Record<string, DocumentTypeOption[]>,
  snippet?: string | null
): DocumentListing {
  const circleName =
    directory.circles.find((circle) => circle.id === doc.circleId)?.name ?? "Board";
  return {
    ...doc,
    circleName,
    typeLabel: typeLabelFor(doc, types),
    canManage: canManageDocument(user, directory, doc),
    canConsent: canConsentDocument(user, directory, doc),
    canWritePage: canUploadTo(user, directory, doc.circleId),
    ...(snippet !== undefined ? { snippet } : {}),
  };
}
