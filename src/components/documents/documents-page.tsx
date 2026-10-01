"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { featureEnabled } from "@/lib/circles/features";
import type { DirectoryDocument } from "@/lib/directory/types";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Card } from "@/components/ui/card";
import { SectionArt } from "@/components/layout/section-art";

// The map (d3, and three.js for 3D) loads in the browser only.
const WikiMap = dynamic(() => import("@/components/admin/wiki-map-client").then((module) => module.WikiMapClient), {
  ssr: false,
  loading: () => <div className="h-[50vh] animate-pulse rounded-2xl bg-accent/40" />,
});

/** Every circle's documents in one place, searchable by title and contents. */
export function DocumentsPage() {
  const { data } = useQuery({ queryKey: ["directory"], queryFn: () => apiFetch<DirectoryDocument>("/api/directory") });
  const { user } = useSession();
  const circles = (data?.circles ?? []).map((circle) => ({ id: circle.id, name: circle.name })).sort((a, b) => a.name.localeCompare(b.name));
  // Where this resident can add documents: their own circles — or every circle, for the Board and admins.
  const inCircle = (circleId: string) =>
    !!user?.personId && !!data?.circles.some((circle) => circle.id === circleId && circle.seats.some((seat) => seat.personId === user.personId));
  // Everyone is in the Community circle.
  const documentsOn = new Set((data?.circles ?? []).filter((circle) => featureEnabled(circle, "documents")).map((circle) => circle.id));
  const uploadCircles = (
    user?.isAdmin || inCircle("board") ? circles : circles.filter((circle) => inCircle(circle.id) || (circle.id === "community" && !!user?.personId))
  ).filter((circle) => documentsOn.has(circle.id));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <SectionArt href="/documents" size={48} />
        <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
      </div>
      <Card className="flex flex-col gap-4">
        <Suspense fallback={<div className="h-[50vh] animate-pulse rounded-2xl bg-accent/40" />}>
          <WikiMap />
        </Suspense>
      </Card>
      <Card>
        <DocumentsPanel circles={circles} uploadCircles={uploadCircles} />
      </Card>
    </div>
  );
}
