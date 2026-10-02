"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Menu,
  Search,
  Share2,
  Layers,
  Grid,
  MessagesSquare,
  BookOpen,
  BookUser,
  CalendarDays,
  Camera,
  Lightbulb,
  Eye,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserMenu } from "@/components/auth/user-menu";
import { AppreciationsFooter } from "@/components/appreciations/appreciations-footer";
import { useSession, useViewAs } from "@/lib/auth/client";
import { setUpPwa } from "@/components/notifications/pwa";
import { SectionArt, hasSectionArt } from "@/components/layout/section-art";
import { Loading } from "@/components/ui/status";

const links = [
  { href: "/", label: "Dashboard", icon: Grid },
  { href: "/directory", label: "Directory", icon: BookUser },
  { href: "/circles", label: "Circles", icon: Layers },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
  { href: "/library", label: "Loan Library", icon: Share2 },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/resources", label: "Resources", icon: Lightbulb },
];

/**
 * The header's magnifying glass: a small menu to search everything (Enter
 * goes to the full search) or browse all documents, which aren't in the
 * header themselves.
 */
function SearchButton({ active }: { active: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // Close on a click outside, on Escape, and when the page changes.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  return (
    // On phones the menu spans the header's width (positioned from the header row); on wider screens it hangs under the button.
    <div ref={box} className="sm:relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Search"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Search ( / )"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border transition",
          active || open
            ? "bg-primary text-primary-foreground shadow-soft"
            : "bg-surface text-foreground/70 hover:bg-accent hover:text-foreground"
        )}
      >
        <Search className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Search and browse"
          className="absolute inset-x-4 top-full z-50 mt-1 rounded-2xl border border-border bg-surface p-2 shadow-elev sm:inset-x-auto sm:right-0 sm:mt-2 sm:w-[21rem]"
        >
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const q = text.trim();
              setOpen(false);
              router.push(q ? `/search?${new URLSearchParams({ q })}` : "/search");
            }}
            className="relative"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search everything…"
              enterKeyHint="search"
              className="h-11 bg-white pl-9"
              aria-label="Search everything"
            />
          </form>
          <div className="mt-2 border-t border-border pt-2">
            <Link
              href="/documents"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-accent"
            >
              <SectionArt href="/documents" size={32} />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">All documents</span>
                <span className="text-xs text-muted">
                  Browse every circle&apos;s, with filters and sorting
                </span>
              </span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A section is active on its own page and the pages under it (e.g. a circle, a forum thread). */
const isActive = (pathname: string, href: string) =>
  pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, viewAs, isLoading } = useSession();
  const exitView = useViewAs();
  const [menuOpen, setMenuOpen] = useState(false);
  const onLoginPage = pathname === "/login";
  // Signed out, "/" is the public front page, which has its own header and footer;
  // "/welcome" is the same page for anyone, including residents previewing it.
  const onWelcome = pathname === "/welcome";
  const onPublicHome = pathname === "/" || onWelcome;

  // Register the service worker (installable app, notifications) and catch the install prompt.
  useEffect(() => setUpPwa(), []);

  // "/" from anywhere that isn't a text box opens the whole-site search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // The middleware only checks the cookie's signature; if the account behind
  // it doesn't exist, send the visitor to sign in rather than show an empty app.
  useEffect(() => {
    if (!isLoading && !user && !onLoginPage && !onPublicHome) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, onLoginPage, onPublicHome, pathname, router]);

  // Signed-out visitors see only the sign-in page: no navigation or footer.
  if ((!user && onPublicHome) || onWelcome) return <>{children}</>;

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b border-border bg-background/90">
          <div className="mx-auto flex max-w-6xl items-center px-4 py-3 md:px-6">
            <Link
              href="/"
              className="flex items-center gap-2 whitespace-nowrap font-display text-xl font-semibold text-foreground"
            >
              <Image src="/CVC.png" alt="" width={32} height={32} priority className="h-8 w-8" />
              Common Pastures
            </Link>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
          {onLoginPage ? children : <Loading />}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        {viewAs ? (
          // An admin viewing the app as a resident: always visible, with the way out.
          <div className="bg-sun text-foreground" role="status">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 text-sm md:px-6">
              <span className="flex items-center gap-1.5">
                <Eye className="h-4 w-4 shrink-0" />
                <span>
                  Viewing as <strong>{user.name}</strong> — read-only
                </span>
              </span>
              <button
                type="button"
                onClick={() => exitView.mutate(null)}
                disabled={exitView.isPending}
                className="rounded-full bg-white/80 px-3 py-0.5 text-xs font-semibold hover:bg-white"
              >
                {exitView.isPending ? "Exiting…" : `Exit — back to ${viewAs.by}`}
              </button>
            </div>
          </div>
        ) : null}
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display text-xl font-semibold text-foreground"
          >
            <Image src="/CVC.png" alt="" width={32} height={32} priority className="h-8 w-8" />
            Common Pastures
          </Link>
          <div className="flex items-center gap-2 xl:hidden">
            <SearchButton active={pathname === "/search"} />
            <UserMenu />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
          <div className="hidden items-center gap-2 xl:flex">
            <nav className="flex gap-0.5">
              {/* The logo leads to the dashboard, so the desktop bar leaves it out to fit every section. */}
              {links
                .filter((link) => link.href !== "/")
                .map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium transition",
                      isActive(pathname, link.href)
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-foreground/70 hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
            </nav>
            <SearchButton active={pathname === "/search"} />
            <UserMenu />
          </div>
        </div>
        {menuOpen ? (
          <div className="border-t border-border bg-background px-4 pb-4 pt-2 xl:hidden">
            <nav className="flex flex-col gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive(pathname, link.href)
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-foreground/70 hover:bg-accent hover:text-foreground"
                  )}
                  onClick={() => setMenuOpen(false)}
                >
                  {hasSectionArt(link.href) ? (
                    <SectionArt href={link.href} size={24} />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                      <link.icon className="h-4 w-4" />
                    </span>
                  )}
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        ) : null}
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
        {children}
      </main>
      <AppreciationsFooter />
    </div>
  );
}
