"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Pencil, Pin, PinOff } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle } from "@/lib/directory/types";
import type { WikiPage } from "@/lib/wiki/store";
import { timeAgo } from "@/lib/time";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type PageResponse = { page: WikiPage; canEdit: boolean; canPin?: boolean };

function PinnedNote({ circle, slug, canPin, canEdit }: { circle: Circle; slug: string; canPin: boolean; canEdit: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Shares the page's own cache, so an edit shows here straight away.
  const { data, error } = useQuery({ queryKey: ["wiki", circle.id, slug], queryFn: () => apiFetch<PageResponse>(`/api/circles/${circle.id}/wiki/${slug}`) });
  const pages = useWikiPages(circle.id).data?.pages ?? [];
  const body = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    if (body.current) setLong(body.current.scrollHeight > 280);
  }, [data]);
  const unpin = useMutation({
    mutationFn: () => apiFetch(`/api/circles/${circle.id}`, { method: "PATCH", body: JSON.stringify({ pinnedWiki: (circle.pinnedWiki ?? []).filter((entry) => entry !== slug) }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      toast({ title: "Unpinned" });
    },
    onError: (err: Error) => toast({ title: "Could not unpin it", description: err.message, variant: "destructive" }),
  });
  if (error || (data && !data.page)) return null;
  const page = data?.page;
  return (
    <article className="relative flex flex-col gap-3 rounded-card border border-sun/40 bg-[#fffbeb] p-5 shadow-soft" aria-label={page ? `Pinned: ${page.title}` : "Pinned note"}>
      <div className="flex items-start gap-2">
        <Pin className="mt-1 h-4 w-4 shrink-0 rotate-45 fill-sun text-sun" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">
            {page ? (
              <Link href={`/circles/${circle.id}/wiki/${slug}`} className="hover:underline">
                {page.title}
              </Link>
            ) : (
              "…"
            )}
          </h2>
          {page ? (
            <p className="text-xs text-muted">
              Pinned note · updated {timeAgo(page.updatedAt)} by {page.updatedBy.name}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canEdit && page ? (
            <Link href={`/circles/${circle.id}/wiki/${slug}?edit=1`} className="rounded-md p-1.5 text-muted hover:bg-sun/15 hover:text-foreground" aria-label="Edit this note" title="Edit">
              <Pencil className="h-4 w-4" />
            </Link>
          ) : null}
          {canPin ? (
            <button type="button" onClick={() => unpin.mutate()} disabled={unpin.isPending} className="rounded-md p-1.5 text-muted hover:bg-sun/15 hover:text-foreground" aria-label="Unpin" title="Unpin">
              <PinOff className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      {page ? (
        <>
          <div ref={body} className={cn("relative", long && !open && "max-h-[17.5rem] overflow-hidden")}>
            <WikiMarkdown source={page.body} circleId={circle.id} pages={pages} />
            {long && !open ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#fffbeb] to-transparent" aria-hidden /> : null}
          </div>
          {long ? (
            <button type="button" onClick={() => setOpen(!open)} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-secondary-foreground hover:underline" aria-expanded={open}>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {open ? "Show less" : "Show all"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}
    </article>
  );
}

/** Wiki pages the circle has pinned to the top of its page, as notes. */
export function PinnedNotes({ circle, canPin, canEdit }: { circle: Circle; canPin: boolean; canEdit: boolean }) {
  const pins = circle.pinnedWiki ?? [];
  if (!pins.length) return null;
  return (
    <div className="flex flex-col gap-4">
      {pins.map((slug) => (
        <PinnedNote key={slug} circle={circle} slug={slug} canPin={canPin} canEdit={canEdit} />
      ))}
    </div>
  );
}
