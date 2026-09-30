"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { DirectoryDocument } from "@/lib/directory/types";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Card } from "@/components/ui/card";
import { SectionArt } from "@/components/layout/section-art";

/** Every circle's documents in one place, searchable by title and contents. */
export function DocumentsPage() {
  const { data } = useQuery({ queryKey: ["directory"], queryFn: () => apiFetch<DirectoryDocument>("/api/directory") });
  const { user } = useSession();
  const circles = (data?.circles ?? []).map((circle) => ({ id: circle.id, name: circle.name })).sort((a, b) => a.name.localeCompare(b.name));
  // Where this resident can add documents: their own circles — or every circle, for the Board and admins.
  const inCircle = (circleId: string) =>
    !!user?.personId && !!data?.circles.some((circle) => circle.id === circleId && circle.seats.some((seat) => seat.personId === user.personId));
  const uploadCircles = user?.isAdmin || inCircle("board") ? circles : circles.filter((circle) => inCircle(circle.id));
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
