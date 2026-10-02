"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * "← …" links that go back to the page you came from (named by its heading),
 * rather than always to the same place. The pages you've been through this
 * session are kept as a trail: going to a page adds it; going back (a back
 * link, or the browser's Back button) steps back along it. Arriving straight
 * from outside (a link, a bookmark), a back link goes where it always did.
 */

const KEY = "cvc-trail";
const CHANGED = "cvc-trail-changed";
const GOING_BACK = "cvc-trail-back";
type Stop = { path: string; name: string };

function readTrail(): Stop[] {
  try {
    const trail = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(trail) ? trail : [];
  } catch {
    return [];
  }
}

function writeTrail(trail: Stop[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-30)));
  } catch {
    // Private browsing: back links just go where they always did.
  }
  window.dispatchEvent(new Event(CHANGED));
}

const pathOf = (path: string) => path.split("?")[0];

/** What the page calls itself: its main heading. */
const pageName = () => document.querySelector("main h1")?.textContent?.trim().slice(0, 60) ?? "";

// Whether the browser's Back (or Forward) button brought us here.
let historyMove = false;

/** Keeps the trail (in the app shell, on every page). */
export function NavigationTrail() {
  const pathname = usePathname();
  useEffect(() => {
    const onPop = () => {
      historyMove = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const here = `${pathname}${window.location.search}`;
    const trail = readTrail();
    let back = historyMove;
    historyMove = false;
    try {
      back = sessionStorage.getItem(GOING_BACK) === "1" || back;
      sessionStorage.removeItem(GOING_BACK);
    } catch {
      // Without storage there's no trail anyway.
    }
    const top = trail[trail.length - 1];
    const earlier = trail.map((stop) => pathOf(stop.path)).lastIndexOf(pathname);
    if (top && pathOf(top.path) === pathname) top.path = here;
    else if (back && earlier >= 0) {
      // Back to a page on the trail: what came after it is left behind.
      trail.length = earlier + 1;
      trail[earlier].path = here;
    } else trail.push({ path: here, name: "" });
    writeTrail(trail);

    // Name this stop once its heading shows (pages load their content after arriving).
    let frame = 0;
    const note = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Already on the way to the next page: its heading isn't this one's.
        if (window.location.pathname !== pathname) return;
        const name = pageName();
        const current = readTrail();
        const top = current[current.length - 1];
        if (!name || !top || pathOf(top.path) !== pathname || top.name === name) return;
        top.name = name;
        writeTrail(current);
      });
    };
    note();
    const observer = new MutationObserver(note);
    const main = document.querySelector("main") ?? document.body;
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return null;
}

/** "← <the page you came from>" — or, with nowhere to go back to, "← `label`" to `href`. */
export function BackLink({ href, label, className }: { href: string; label: string; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [previous, setPrevious] = useState<Stop | null>(null);
  useEffect(() => {
    const update = () => {
      const trail = readTrail();
      const top = trail.length - 1;
      setPrevious(top >= 1 && pathOf(trail[top].path) === pathname ? trail[top - 1] : null);
    };
    update();
    window.addEventListener(CHANGED, update);
    return () => window.removeEventListener(CHANGED, update);
  }, [pathname]);
  return (
    <Link
      href={previous?.path ?? href}
      onClick={(event) => {
        if (!previous || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        try {
          sessionStorage.setItem(GOING_BACK, "1");
        } catch {
          // It still goes there; the trail just grows.
        }
        router.push(previous.path);
      }}
      className={className ?? "inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground"}
    >
      <ArrowLeft className="h-4 w-4" /> {previous ? (pathOf(previous.path) === "/" ? "Dashboard" : previous.name || "Back") : label}
    </Link>
  );
}
