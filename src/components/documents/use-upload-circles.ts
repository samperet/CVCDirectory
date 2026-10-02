"use client";

import { useSession } from "@/lib/auth/client";
import { featureEnabled } from "@/lib/circles/features";
import { isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { useDirectoryQuery } from "@/components/directory/use-directory";

/**
 * The circles, by name, and those the signed-in resident can upload files
 * to: their own circles and Community — or every circle, for the Board and
 * admins — where the circle has documents turned on. (The server decides;
 * this only shows or hides the way in.)
 */
export function useUploadCircles() {
  const { data } = useDirectoryQuery();
  const { user } = useSession();
  const circles = (data?.circles ?? [])
    .map((circle) => ({ id: circle.id, name: circle.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const inCircle = (circleId: string) =>
    !!user?.personId &&
    !!data?.circles.some(
      (circle) =>
        circle.id === circleId && circle.seats.some((seat) => seat.personId === user.personId)
    );
  const documentsOn = new Set(
    (data?.circles ?? [])
      .filter((circle) => featureEnabled(circle, "documents"))
      .map((circle) => circle.id)
  );
  const uploadCircles = (
    user?.isAdmin || sitsOnBoard(data?.circles ?? [], user?.personId)
      ? circles
      : circles.filter(
          (circle) => inCircle(circle.id) || (isCommunity(circle.id) && !!user?.personId)
        )
  ).filter((circle) => documentsOn.has(circle.id));
  return { circles, uploadCircles };
}
