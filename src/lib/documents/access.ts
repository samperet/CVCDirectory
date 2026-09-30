import { isAdmin } from "@/lib/auth/admins";
import { canManageCircle, holdsSeat } from "@/lib/circles/icons";
import { BOARD_ID } from "@/lib/circles/store";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { DocumentListing, DocumentRecord, DocumentTypeOption } from "./types";
import { typeLabelFor } from "./type-store";

/**
 * Every signed-in resident can see and search every document. A circle's
 * members, the Board, and admins upload to it (any resident, for the
 * Community circle); whoever uploaded a document
 * can also edit, replace, or delete it.
 */

type Viewer = { personId?: string | null };

export function canUploadTo(user: Viewer, directory: DirectoryDocument, circleId: string) {
  // Everyone is in the Community circle, so any resident can add its documents.
  if (circleId === "community" && user.personId) return true;
  return isAdmin(user) || (!!user.personId && canManageCircle(directory, circleId, user.personId));
}

export function canManageDocument(user: Viewer, directory: DirectoryDocument, doc: DocumentRecord) {
  return canUploadTo(user, directory, doc.circleId) || (!!user.personId && doc.versions[0]?.uploadedBy.personId === user.personId);
}

/** Record or withdraw consent to a document: its circle's Secretary, the Board Secretary, or an admin. */
export function canConsentDocument(user: Viewer, directory: DirectoryDocument, doc: Pick<DocumentRecord, "circleId">) {
  if (isAdmin(user)) return true;
  if (!user.personId) return false;
  return holdsSeat(directory, doc.circleId, user.personId, /secretary/i) || holdsSeat(directory, BOARD_ID, user.personId, /secretary/i);
}

export function toListing(
  doc: DocumentRecord,
  user: Viewer,
  directory: DirectoryDocument,
  types: Record<string, DocumentTypeOption[]>,
  snippet?: string | null
): DocumentListing {
  const circleName = directory.circles.find((circle) => circle.id === doc.circleId)?.name ?? "Board";
  return {
    ...doc,
    circleName,
    typeLabel: typeLabelFor(doc, types),
    canManage: canManageDocument(user, directory, doc),
    canConsent: canConsentDocument(user, directory, doc),
    ...(snippet !== undefined ? { snippet } : {}),
  };
}
