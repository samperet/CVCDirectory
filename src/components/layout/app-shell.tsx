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
  FileText,
  BookUser,
  CalendarDays,
  Camera,
  Lightbulb,
  Eye,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { SearchPalette } from "@/components/search/search-palette";
import {
  CirclesMenuItems,
  DocumentsMenuItems,
  MobileCircleLinks,
  MobileDocumentsLinks,
  NavMenu,
} from "@/components/layout/nav-menu";
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
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/library", label: "Loan Library", icon: Share2 },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/resources", label: "Resources", icon: Lightbulb },
];

/** The header's magnifying glass: opens the search bar (`SearchPalette`). */
function SearchButton({
  active,
  open,
  onOpen,
}: {
  active: boolean;
  open: boolean;
  onOpen: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
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
  );
}

/** A section is active on its own page and the pages under it (e.g. a circle, a forum thread). */
const isActive = (pathname: string, href: string) =>
  pathname === href ||
  (href !== "/" && pathname.startsWith(`${href}/`)) ||
  // Written pages are documents too.
  (href === "/documents" && pathname.startsWith("/wiki/"));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, viewAs, isLoading } = useSession();
  const exitView = useViewAs();
  const [menuOpen, setMenuOpen] = useState(false);
  // The search bar, and the button that opened it (focus goes back there when it closes).
  const [searching, setSearching] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const openSearch = (from: HTMLElement | null) => {
    opener.current = from;
    setSearching(true);
  };
  const closeSearch = () => {
    setSearching(false);
    opener.current?.focus();
  };
  useEffect(() => setSearching(false), [pathname]);
  const onLoginPage = pathname === "/login";
  // Signed out, "/" is the public front page, which has its own header and footer;
  // "/welcome" is the same page for anyone, including residents previewing it.
  const onWelcome = pathname === "/welcome";
  const onPublicHome = pathname === "/" || onWelcome;
  // A new member's welcome form (from their emailed link): the same plain page for anyone.
  const onJoin = pathname.startsWith("/join/");

  // Register the service worker (installable app, notifications) and catch the install prompt.
  useEffect(() => setUpPwa(), []);

  // "/" from anywhere that isn't a text box, or Ctrl+K (⌘K) from anywhere, opens the search bar.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const slash =
        event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
      const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (slash || commandK) {
        event.preventDefault();
        opener.current = document.activeElement as HTMLElement | null;
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The middleware only checks the cookie's signature; if the account behind
  // it doesn't exist, send the visitor to sign in rather than show an empty app.
  useEffect(() => {
    if (!isLoading && !user && !onLoginPage && !onPublicHome && !onJoin) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, onLoginPage, onPublicHome, onJoin, pathname, router]);

  // Signed-out visitors see only the sign-in page: no navigation or footer.
  if ((!user && onPublicHome) || onWelcome) return <>{children}</>;

  if (!user || onJoin) {
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
          {onLoginPage || onJoin ? children : <Loading />}
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
            <SearchButton active={pathname === "/search"} open={searching} onOpen={openSearch} />
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
                .map((link) =>
                  link.href === "/documents" || link.href === "/circles" ? (
                    <NavMenu
                      key={link.href}
                      href={link.href}
                      label={link.label}
                      active={isActive(pathname, link.href)}
                    >
                      {(close) =>
                        link.href === "/documents" ? (
                          <DocumentsMenuItems close={close} />
                        ) : (
                          <CirclesMenuItems close={close} />
                        )
                      }
                    </NavMenu>
                  ) : (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={isActive(pathname, link.href) ? "page" : undefined}
                      className={cn(
                        "whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium transition",
                        isActive(pathname, link.href)
                          ? "bg-primary text-primary-foreground shadow-soft"
                          : "text-foreground/70 hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {link.label}
                    </Link>
                  )
                )}
            </nav>
            <SearchButton active={pathname === "/search"} open={searching} onOpen={openSearch} />
            <UserMenu />
          </div>
        </div>
        {menuOpen ? (
          <div className="border-t border-border bg-background px-4 pb-4 pt-2 xl:hidden">
            <nav className="flex flex-col gap-2">
              {links.map((link) => (
                <Fragment key={link.href}>
                  <Link
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
                  {link.href === "/documents" ? (
                    <MobileDocumentsLinks onChoose={() => setMenuOpen(false)} />
                  ) : link.href === "/circles" ? (
                    <MobileCircleLinks onChoose={() => setMenuOpen(false)} />
                  ) : null}
                </Fragment>
              ))}
            </nav>
          </div>
        ) : null}
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
        {children}
      </main>
      <AppreciationsFooter />
      {searching && user ? <SearchPalette onClose={closeSearch} /> : null}
    </div>
  );
}
