"use client";

import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { noteStyle, type PinView } from "@/lib/pins/shared";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { ON_HOVER } from "@/components/ui/hover";
import { cn } from "@/lib/utils";

/**
 * Other ways to show pinned pages besides sticky notes: each page in full,
 * on its own colour, or just their titles as a list.
 */

function UnpinButton({ pin, onUnpin, busy, className }: { pin: PinView; onUnpin: () => void; busy: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onUnpin}
      disabled={busy}
      className={cn("shrink-0 rounded-md p-1 text-foreground-light hover:bg-black/5 hover:text-foreground", ON_HOVER, className)}
      aria-label={`Unpin “${pin.note.title}”`}
      title="Unpin"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/** A page in full, as it reads on its own page. */
export function FullNote({ pin, showCircle, onUnpin, busy = false }: { pin: PinView; showCircle: boolean; onUnpin?: () => void; busy?: boolean }) {
  const style = noteStyle(pin.note.color);
  const pages = useWikiPages().data?.pages ?? [];
  return (
    <article className="group/post flex min-w-0 flex-col gap-3 rounded-lg border p-4 shadow-soft sm:p-5" style={{ backgroundColor: style.paper, borderColor: style.edge }} aria-label={pin.note.title}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-snug text-foreground">
            <Link href={pin.note.href} className="hover:underline">
              {pin.note.title}
            </Link>
          </h3>
          {showCircle || pin.reason ? (
            <p className="text-xs text-foreground-light/80">{[pin.reason ? `“${pin.reason}”` : null, showCircle ? pin.note.circleName : null].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
        <Link href={pin.note.href} className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-black/5" title="Open the page">
          Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        {onUnpin ? <UnpinButton pin={pin} onUnpin={onUnpin} busy={busy} /> : null}
      </div>
      {pin.note.body === undefined ? (
        <p className="whitespace-pre-line text-sm text-foreground-light">{pin.note.excerpt}</p>
      ) : (
        <div className="min-w-0">
          <WikiMarkdown source={pin.note.body} circleId={pin.note.circleId} pages={pages} pageId={pin.note.pageId} />
        </div>
      )}
    </article>
  );
}

/** Just the titles, each on its colour, as a compact list. */
export function TitleList({ pins, circleId, onUnpin, busy }: { pins: PinView[]; circleId?: string; onUnpin: (pin: PinView) => void; busy: boolean }) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {pins.map((pin) => {
        const style = noteStyle(pin.note.color);
        return (
          <li key={pin.id} className="group/post relative flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2 transition hover:shadow-soft" style={{ backgroundColor: style.paper, borderColor: style.edge }}>
            <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: style.swatch }} aria-hidden />
            <Link href={pin.note.href} className="min-w-0 flex-1 truncate text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
              {pin.note.title}
            </Link>
            {pin.note.circleId !== circleId ? <span className="shrink-0 text-xs text-foreground-light/80">{pin.note.circleName}</span> : null}
            {pin.canUnpin ? <UnpinButton pin={pin} onUnpin={() => onUnpin(pin)} busy={busy} className="relative z-10 -my-1 -mr-1.5" /> : null}
          </li>
        );
      })}
    </ul>
  );
}
