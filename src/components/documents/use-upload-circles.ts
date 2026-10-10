"use client";

import { useSession } from "@/lib/auth/client";
import { featureEnabled } from "@/lib/circles/features";
import { isCommunity } from "@/lib/circles/ids";
import { managesCircle } from "@/lib/circles/tiers";
import { useDirectoryQuery } from "@/components/directory/use-directory";

/**
 * The circles, by name; those the signed-in resident can upload files to:
 * their own circles and Community — or every circle, for the Board and
 * admins — where the circle has documents turned on; and those whose
 * document types they can edit (their own circles, or every one for the
 * Board and admins). (The server decides; this only shows or hides the way
 * in.)
 */
export function useUploadCircles() {
  const { data } = useDirectoryQuery();
  const { user } = useSession();
  const circles = (data?.circles ?? [])
    .map((circle) => ({ id: circle.id, name: circle.name, parentId: circle.parentId }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Theirs: they're in it, in the circle it's a sub group of, or on the Board (`managesCircle`).
  const manages = (circleId: string) =>
    !!user?.isAdmin || managesCircle(data?.circles ?? [], circleId, user?.personId);
  const documentsOn = new Set(
    (data?.circles ?? [])
      .filter((circle) => featureEnabled(circle, "documents"))
      .map((circle) => circle.id)
  );
  const uploadCircles = circles.filter(
    (circle) =>
      (manages(circle.id) || (isCommunity(circle.id) && !!user?.personId)) &&
      documentsOn.has(circle.id)
  );
  const typeCircles = circles.filter((circle) => manages(circle.id) && documentsOn.has(circle.id));
  return { circles, uploadCircles, typeCircles };
}
