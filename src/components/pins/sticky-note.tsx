"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { noteStyle, type PinView } from "@/lib/pins/shared";
import { ON_HOVER } from "@/components/ui/hover";
import { cn } from "@/lib/utils";

/** "Oct 8", from YYYY-MM-DD. */
export const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Days from today until a YYYY-MM-DD date (0 = today). */
export function daysUntil(date: string) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${date}T12:00:00`).getTime() - today.getTime()) / 86_400_000);
}

// A slight, steady tilt per note, as if stuck up by hand.
const TILTS = ["-rotate-[0.6deg]", "rotate-[0.5deg]", "-rotate-[0.3deg]", "rotate-[0.8deg]", "rotate-0"];
const tiltFor = (id: string) => TILTS[Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % TILTS.length];

/**
 * A pinned note as a sticky: its colour, title, and opening lines; the
 * whole note opens the page. Whoever may unpin it sees a × on hover.
 */
export function StickyNote({
  pin,
  onUnpin,
  busy = false,
  showCircle = true,
  className,
}: {
  pin: PinView;
  onUnpin?: () => void;
  busy?: boolean;
  /** Name the note's circle (left out where it's obvious). */
  showCircle?: boolean;
  className?: string;
}) {
  const style = noteStyle(pin.note.color);
  const ending = pin.until !== null && daysUntil(pin.until) <= 7;
  return (
    <article
      className={cn(
        "group/post relative flex min-h-[8.5rem] flex-col gap-1.5 rounded-md border p-4 pt-3.5 shadow-soft transition hover:rotate-0 hover:shadow-elev focus-within:rotate-0",
        tiltFor(pin.id),
        className
      )}
      style={{ backgroundColor: style.paper, borderColor: style.edge }}
      aria-label={`Note: ${pin.note.title}`}
    >
      <h3 className="line-clamp-2 pr-5 font-semibold leading-snug text-foreground">
        <Link href={pin.note.href} className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
          {pin.note.title}
        </Link>
      </h3>
      {pin.note.excerpt ? <p className="line-clamp-4 whitespace-pre-line text-sm leading-snug text-foreground-light">{pin.note.excerpt}</p> : null}
      {pin.reason || ending || showCircle ? (
        <p className="mt-auto pt-1 text-xs text-foreground-light/80">
          {[pin.reason ? `“${pin.reason}”` : null, ending ? (daysUntil(pin.until!) === 0 ? "until today" : `until ${shortDate(pin.until!)}`) : null, showCircle ? pin.note.circleName : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {onUnpin ? (
        <button
          type="button"
          onClick={onUnpin}
          disabled={busy}
          className={cn("absolute right-1.5 top-1.5 z-10 rounded-md p-1 text-foreground-light hover:bg-black/5 hover:text-foreground", ON_HOVER)}
          aria-label={`Unpin “${pin.note.title}”`}
          title="Unpin"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </article>
  );
}
