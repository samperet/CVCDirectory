import { isAdmin } from "@/lib/auth/admins";
import { canManageCircle } from "@/lib/circles/icons";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { DocumentListing, DocumentRecord } from "./types";

/**
 * Every signed-in resident can see and search every document. A circle's
 * members, the Board, and admins upload to it; whoever uploaded a document
 * can also edit, replace, or delete it.
 */

type Viewer = { personId?: string | null };

export function canUploadTo(user: Viewer, directory: DirectoryDocument, circleId: string) {
  return isAdmin(user) || (!!user.personId && canManageCircle(directory, circleId, user.personId));
}

export function canManageDocument(user: Viewer, directory: DirectoryDocument, doc: DocumentRecord) {
  return canUploadTo(user, directory, doc.circleId) || (!!user.personId && doc.versions[0]?.uploadedBy.personId === user.personId);
}

export function toListing(doc: DocumentRecord, user: Viewer, directory: DirectoryDocument, snippet?: string | null): DocumentListing {
  const circleName = directory.circles.find((circle) => circle.id === doc.circleId)?.name ?? "Board";
  return { ...doc, circleName, canManage: canManageDocument(user, directory, doc), ...(snippet !== undefined ? { snippet } : {}) };
}
