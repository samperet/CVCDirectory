"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu, Share2, Layers, Grid, Sparkles, MessagesSquare, BookUser, CalendarDays, Camera, Lightbulb, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/user-menu";
import { AppreciationsFooter } from "@/components/appreciations/appreciations-footer";
import { useSession, useViewAs } from "@/lib/auth/client";

const links = [
  { href: "/", label: "Dashboard", icon: Grid },
  { href: "/directory", label: "Directory", icon: BookUser },
  { href: "/circles", label: "Circles", icon: Layers },
  { href: "/library", label: "Loan Library", icon: Share2 },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/resources", label: "Resources", icon: Lightbulb },
];

/** A section is active on its own page and the pages under it (e.g. a circle, a forum thread). */
const isActive = (pathname: string, href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, viewAs, isLoading } = useSession();
  const exitView = useViewAs();
  const [menuOpen, setMenuOpen] = useState(false);
  const onLoginPage = pathname === "/login";

  // The middleware only checks the cookie's signature; if the account behind
  // it doesn't exist, send the visitor to sign in rather than show an empty app.
  useEffect(() => {
    if (!isLoading && !user && !onLoginPage) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, onLoginPage, pathname, router]);

  // Signed-out visitors see only the sign-in page: no navigation or footer.
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b border-border bg-background/90">
          <div className="mx-auto flex max-w-6xl items-center px-4 py-3 md:px-6">
            <span className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold text-foreground">
              <Image src="/CVC.png" alt="" width={32} height={32} priority className="h-8 w-8" />
              CVC Directory
            </span>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
          {onLoginPage ? children : <p className="text-sm text-muted">Loading…</p>}
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-semibold text-foreground">
            <Image src="/CVC.png" alt="" width={32} height={32} priority className="h-8 w-8" />
            CVC Directory
          </Link>
          <div className="flex items-center gap-2 xl:hidden">
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
              {links.map((link) => (
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
                  <link.icon className="h-4 w-4" />
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
