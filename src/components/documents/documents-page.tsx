"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Network, X } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { featureEnabled } from "@/lib/circles/features";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Card } from "@/components/ui/card";
import { SectionArt } from "@/components/layout/section-art";
import { isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { useDirectoryQuery } from "@/components/directory/use-directory";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Button } from "@/components/ui/button";

// The map of how pages link (d3, and three.js for 3D) loads in the browser only, when it's opened.
const WikiMap = dynamic(
  () => import("@/components/wiki/map-client").then((module) => module.WikiMapClient),
  {
    ssr: false,
    loading: () => <div className="h-[50vh] animate-pulse rounded-2xl bg-accent/40" />,
  }
);

/**
 * Every circle's documents in one place — the pages written here and the
 * files uploaded — searchable by title and contents. `?circle=` starts on
 * one circle's; `?new=Title&from=<pageId>` opens "Write a page" (a link to a
 * page that doesn't exist yet); the Map button (`?map=1`, with `focus` or
 * `circle`) shows how the pages link to each other.
 */
export function DocumentsPage() {
  const { data } = useDirectoryQuery();
  const { user } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const keepers = useWikiPages().data?.keepers ?? [];
  const showMap = params.get("map") === "1";
  const requested = params.get("new");
  const toggleMap = () => {
    const next = new URLSearchParams(params.toString());
    if (showMap) {
      next.delete("map");
      next.delete("focus");
    } else next.set("map", "1");
    router.replace(next.toString() ? `/documents?${next}` : "/documents");
  };
  const circles = (data?.circles ?? [])
    .map((circle) => ({ id: circle.id, name: circle.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Where this resident can add documents: their own circles — or every circle, for the Board and admins.
  const inCircle = (circleId: string) =>
    !!user?.personId &&
    !!data?.circles.some(
      (circle) =>
        circle.id === circleId && circle.seats.some((seat) => seat.personId === user.personId)
    );
  // Everyone is in the Community circle.
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
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <SectionArt href="/documents" size={48} />
        <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
        <Button
          variant="outline"
          className="ml-auto gap-1.5"
          onClick={toggleMap}
          aria-pressed={showMap}
          title="How the written pages link to each other"
        >
          {showMap ? <X className="h-4 w-4" /> : <Network className="h-4 w-4" />}{" "}
          {showMap ? "Close map" : "Map"}
        </Button>
      </div>
      <p className="-mt-3 text-sm text-muted">
        Pages written here and files uploaded, for every circle. Anything people will keep improving
        is best written as a page; a fixed record, or anything from outside, uploaded as a file.
      </p>
      {showMap ? (
        <Card className="flex flex-col gap-4">
          <Suspense fallback={<div className="h-[50vh] animate-pulse rounded-2xl bg-accent/40" />}>
            <WikiMap />
          </Suspense>
        </Card>
      ) : null}
      <Card>
        <DocumentsPanel
          circles={circles}
          uploadCircles={uploadCircles}
          canWrite={keepers.length > 0}
          initialCircle={params.get("circle") ?? ""}
          newPage={
            requested !== null
              ? { title: requested, from: params.get("from") ?? undefined }
              : undefined
          }
        />
      </Card>
    </div>
  );
}
