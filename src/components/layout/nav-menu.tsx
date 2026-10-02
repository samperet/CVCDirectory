"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, Upload } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { useCircles } from "@/components/directory/use-directory";
import { CircleIcon } from "@/components/circles/circle-icon";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { useUploadCircles } from "@/components/documents/use-upload-circles";
import { cn } from "@/lib/utils";

/**
 * A header item with a menu: its label still goes to its page; pointing at it
 * (after a moment) or pressing its arrow opens the menu, which ↑/↓ move
 * through and Escape, a click elsewhere, or a choice closes.
 */
export function NavMenu({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  /** The menu's items (rendered only while it's open). */
  children: (close: () => void) => ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const later = (next: boolean, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), ms);
  };
  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => close(), [pathname]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        box.current?.querySelector<HTMLElement>("[data-nav-chevron]")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const items = () =>
    Array.from(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
  const move = (step: number) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    list[(at + step + list.length) % list.length]?.focus();
  };

  return (
    <div
      ref={box}
      className="relative"
      onMouseEnter={() => later(true, 150)}
      onMouseLeave={() => later(false, 250)}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      <div
        className={cn(
          "flex items-center rounded-full text-sm font-medium transition",
          active
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-foreground/70 hover:bg-accent hover:text-foreground"
        )}
      >
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className="whitespace-nowrap py-2 pl-2.5 pr-0.5"
        >
          {label}
        </Link>
        <button
          type="button"
          data-nav-chevron
          aria-label={`${label} menu`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              requestAnimationFrame(() => items()[0]?.focus());
            }
          }}
          className="rounded-full py-2 pl-0.5 pr-2"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 opacity-70 transition", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>
      {open ? (
        // The padding bridges the gap, so moving the pointer down doesn't close it.
        <div className="absolute left-0 top-full z-50 pt-1.5">
          <div
            role="menu"
            aria-label={label}
            className="max-h-[60vh] w-64 overflow-y-auto rounded-xl border border-border bg-white p-1 shadow-elev"
          >
            {children(close)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const itemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent";
const groupLabel = "px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted";

/** The Documents menu: all of them, or start one (if you can). */
export function DocumentsMenuItems({ close }: { close: () => void }) {
  const canWrite = (useWikiPages().data?.keepers.length ?? 0) > 0;
  const canUpload = useUploadCircles().uploadCircles.length > 0;
  return (
    <>
      <Link href="/documents" role="menuitem" className={itemClass} onClick={close}>
        All documents
      </Link>
      {canWrite || canUpload ? <div className="my-1 h-px bg-border" role="separator" /> : null}
      {canWrite ? (
        <Link href="/documents?new=" role="menuitem" className={itemClass} onClick={close}>
          <BookOpen className="h-4 w-4 text-primary" aria-hidden /> New document
        </Link>
      ) : null}
      {canUpload ? (
        <Link href="/documents?upload=1" role="menuitem" className={itemClass} onClick={close}>
          <Upload className="h-4 w-4 text-primary" aria-hidden /> Upload a file
        </Link>
      ) : null}
    </>
  );
}

/** The circles, split into yours and the rest, each by name with its icon. */
export function useCircleGroups() {
  const circles = useCircles();
  const { user } = useSession();
  const sorted = [...(circles ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const mine = sorted.filter((circle) =>
    circle.seats.some((seat) => !!user?.personId && seat.personId === user.personId)
  );
  const others = sorted.filter((circle) => !mine.includes(circle));
  return { mine, others };
}

/** The Circles menu: all of them, then yours and the others, with their icons. */
export function CirclesMenuItems({ close }: { close: () => void }) {
  const { mine, others } = useCircleGroups();
  const row = (circle: (typeof mine)[number]) => (
    <Link
      key={circle.id}
      href={`/circles/${circle.id}`}
      role="menuitem"
      className={itemClass}
      onClick={close}
    >
      <CircleIcon circle={circle} size={22} className="shrink-0 rounded-full" />
      <span className="truncate">{circle.name}</span>
    </Link>
  );
  return (
    <>
      <Link href="/circles" role="menuitem" className={itemClass} onClick={close}>
        All circles
      </Link>
      {mine.length ? (
        <>
          <p className={groupLabel}>Your circles</p>
          {mine.map(row)}
        </>
      ) : null}
      {others.length ? (
        <>
          <p className={groupLabel}>{mine.length ? "Other circles" : "Circles"}</p>
          {others.map(row)}
        </>
      ) : null}
    </>
  );
}

const subLink =
  "flex items-center gap-2 rounded-lg py-1.5 pl-11 pr-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground";

/** In the phone menu, under Documents: start one (if you can). */
export function MobileDocumentsLinks({ onChoose }: { onChoose: () => void }) {
  const canWrite = (useWikiPages().data?.keepers.length ?? 0) > 0;
  const canUpload = useUploadCircles().uploadCircles.length > 0;
  return (
    <>
      {canWrite ? (
        <Link href="/documents?new=" className={subLink} onClick={onChoose}>
          <BookOpen className="h-4 w-4 text-primary" aria-hidden /> New document
        </Link>
      ) : null}
      {canUpload ? (
        <Link href="/documents?upload=1" className={subLink} onClick={onChoose}>
          <Upload className="h-4 w-4 text-primary" aria-hidden /> Upload a file
        </Link>
      ) : null}
    </>
  );
}

/** In the phone menu, under Circles: yours, with their icons — and the rest on request. */
export function MobileCircleLinks({ onChoose }: { onChoose: () => void }) {
  const { mine, others } = useCircleGroups();
  const [all, setAll] = useState(false);
  const row = (circle: (typeof mine)[number]) => (
    <Link key={circle.id} href={`/circles/${circle.id}`} className={subLink} onClick={onChoose}>
      <CircleIcon circle={circle} size={20} className="shrink-0 rounded-full" />
      <span className="truncate">{circle.name}</span>
    </Link>
  );
  return (
    <>
      {mine.map(row)}
      {all ? others.map(row) : null}
      {others.length ? (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          aria-expanded={all}
          className={cn(subLink, "font-medium text-secondary-foreground")}
        >
          <ChevronDown className={cn("h-4 w-4 transition", all && "rotate-180")} aria-hidden />
          {all ? "Show fewer circles" : mine.length ? "Show all circles" : "Show the circles"}
        </button>
      ) : null}
    </>
  );
}
