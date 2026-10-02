"use client";

import { useSession } from "@/lib/auth/client";
import { featureEnabled } from "@/lib/circles/features";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Card } from "@/components/ui/card";
import { SectionArt } from "@/components/layout/section-art";
import { isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { useDirectoryQuery } from "@/components/directory/use-directory";

/** Every circle's documents in one place, searchable by title and contents. */
export function DocumentsPage() {
  const { data } = useDirectoryQuery();
  const { user } = useSession();
  const circles = (data?.circles ?? []).map((circle) => ({ id: circle.id, name: circle.name })).sort((a, b) => a.name.localeCompare(b.name));
  // Where this resident can add documents: their own circles — or every circle, for the Board and admins.
  const inCircle = (circleId: string) =>
    !!user?.personId && !!data?.circles.some((circle) => circle.id === circleId && circle.seats.some((seat) => seat.personId === user.personId));
  // Everyone is in the Community circle.
  const documentsOn = new Set((data?.circles ?? []).filter((circle) => featureEnabled(circle, "documents")).map((circle) => circle.id));
  const uploadCircles = (
    user?.isAdmin || sitsOnBoard(data?.circles ?? [], user?.personId) ? circles : circles.filter((circle) => inCircle(circle.id) || (isCommunity(circle.id) && !!user?.personId))
  ).filter((circle) => documentsOn.has(circle.id));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <SectionArt href="/documents" size={48} />
        <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
      </div>
      <Card>
        <DocumentsPanel circles={circles} uploadCircles={uploadCircles} />
      </Card>
    </div>
  );
}
