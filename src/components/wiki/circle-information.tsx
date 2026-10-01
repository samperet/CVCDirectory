"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Network, Plus } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import type { Circle } from "@/lib/directory/types";
import { StickyGrid, pinsQuery, useUnpin } from "@/components/pins/pin-board";
import { AddInformationDialog } from "@/components/pins/add-information-dialog";
import { SectionToggle } from "@/components/circles/circle-sections";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * A circle's information: the wiki pages added on it (and any pinned to it
 * from other circles), as full-colour cards, newest first. "Add Information"
 * starts a new page here; pages started from inside a page aren't listed,
 * but are all under "All pages".
 */
export function CircleInformation({ circle }: { circle: Circle }) {
  const { user } = useSession();
  const target = { kind: "circle" as const, id: circle.id };
  const { data, isLoading } = useQuery(pinsQuery(target));
  const pageCount = useWikiPages(circle.id).data?.pages.length ?? 0;
  const takeOff = useUnpin("Taken off the circle page");
  const [adding, setAdding] = useState(false);
  const pins = data?.pins ?? [];
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <SectionToggle />
          <BookOpen className="h-5 w-5 text-primary" aria-hidden /> Information
        </h2>
        {data?.canAdd ? (
          <Button className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add Information
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : pins.length ? (
        <StickyGrid
          pins={pins}
          circleId={circle.id}
          busy={takeOff.isPending}
          onUnpin={(pin) => {
            const own = pin.note.circleId === circle.id;
            if (window.confirm(own ? `Take “${pin.note.title}” off ${circle.name}'s page? It stays in the wiki.` : `Unpin “${pin.note.title}” from ${circle.name}?`)) takeOff.mutate(pin.id);
          }}
        />
      ) : (
        <p className="text-sm text-muted">{data?.canAdd ? "Nothing here yet — add the first piece of information." : "Nothing here yet."}</p>
      )}
      {pageCount || user?.isAdmin ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
          {pageCount ? (
            <Link href={`/circles/${circle.id}/wiki`} className="font-medium text-secondary-foreground hover:underline">
              All pages ({pageCount})
            </Link>
          ) : null}
          {user?.isAdmin ? (
            <Link href={`/admin/wiki-map?circle=${circle.id}`} className="inline-flex items-center gap-1 font-medium text-secondary-foreground hover:underline">
              <Network className="h-4 w-4" /> Map
            </Link>
          ) : null}
        </div>
      ) : null}
      {adding ? <AddInformationDialog circle={circle} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}
