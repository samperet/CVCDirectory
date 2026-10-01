"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, LayoutGrid, List, Network, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { DEFAULT_INFO_VIEW, INFO_VIEWS, INFO_VIEW_LABELS, type InfoView } from "@/lib/circles/layout";
import type { Circle } from "@/lib/directory/types";
import { StickyGrid, pinsQuery, useUnpin } from "@/components/pins/pin-board";
import { AddInformationDialog } from "@/components/pins/add-information-dialog";
import { SectionToggle } from "@/components/circles/circle-sections";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const VIEW_ICONS: Record<InfoView, typeof List> = { full: FileText, summary: LayoutGrid, titles: List };

/** Choosing how the circle's pages show (for everyone): in full, as summaries, or titles only. */
function ViewPicker({ value, onChange, disabled }: { value: InfoView; onChange: (view: InfoView) => void; disabled: boolean }) {
  return (
    <div className="inline-flex rounded-full border border-border bg-surface p-0.5 text-xs" role="radiogroup" aria-label="Show pages as">
      {INFO_VIEWS.map((view) => {
        const Icon = VIEW_ICONS[view];
        return (
          <button
            key={view}
            type="button"
            role="radio"
            aria-checked={value === view}
            disabled={disabled}
            onClick={() => onChange(view)}
            title={`Show pages: ${INFO_VIEW_LABELS[view]}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition",
              value === view ? "bg-primary text-primary-foreground shadow-soft" : "text-muted hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {INFO_VIEW_LABELS[view]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A circle's information: the wiki pages added on it (and any pinned to it
 * from other circles), as full-colour cards, newest first. "Add Information"
 * starts a new page here; pages started from inside a page aren't listed,
 * but are all under "All pages". The circle's members (and the Board)
 * choose how they show: in full, as summary cards, or titles only.
 */
export function CircleInformation({ circle, canArrange = false }: { circle: Circle; canArrange?: boolean }) {
  const { user } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const saved = circle.infoView ?? DEFAULT_INFO_VIEW;
  const [view, setView] = useState<InfoView>(saved);
  useEffect(() => setView(saved), [saved]);
  const changeView = useMutation({
    mutationFn: (infoView: InfoView) => apiFetch(`/api/circles/${circle.id}`, { method: "PATCH", body: JSON.stringify({ infoView }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["directory"] }),
    onError: (err: Error) => {
      setView(saved);
      toast({ title: "Could not change how pages show", description: err.message, variant: "destructive" });
    },
  });
  const target = { kind: "circle" as const, id: circle.id };
  // Switching views keeps showing what's there while the pages' full text loads.
  const { data, isLoading } = useQuery({ ...pinsQuery(target, { full: view === "full" }), placeholderData: (previous, query) => (query?.queryKey[1] === `circle:${circle.id}` ? previous : undefined) });
  const pageCount = useWikiPages().data?.pages.filter((page) => page.keeper === circle.id).length ?? 0;
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
        <div className="flex flex-wrap items-center gap-2">
          {canArrange && pins.length ? (
            <ViewPicker
              value={view}
              disabled={changeView.isPending}
              onChange={(next) => {
                if (next === view) return;
                setView(next);
                changeView.mutate(next);
              }}
            />
          ) : null}
          {data?.canAdd ? (
            <Button className="gap-1" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add Information
            </Button>
          ) : null}
        </div>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : pins.length ? (
        <StickyGrid
          pins={pins}
          circleId={circle.id}
          view={view}
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
            <Link href={`/wiki?keeper=${circle.id}`} className="font-medium text-secondary-foreground hover:underline">
              All pages {circle.name} keeps ({pageCount})
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
