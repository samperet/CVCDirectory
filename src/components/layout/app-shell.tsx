"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu, Share2, Layers, Grid, Sparkles, MessagesSquare, BookUser } from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/user-menu";
import { AppreciationsFooter } from "@/components/appreciations/appreciations-footer";
import { useSession } from "@/lib/auth/client";

const links = [
  { href: "/", label: "Dashboard", icon: Grid },
  { href: "/directory", label: "Directory", icon: BookUser },
  { href: "/circles", label: "Circles", icon: Layers },
  { href: "/library", label: "Loan Library", icon: Share2 },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useSession();
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
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
          <div className="hidden items-center gap-3 xl:flex">
            <nav className="flex gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition",
                    pathname === link.href
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-foreground/70 hover:bg-accent hover:text-foreground"
                  )}
                >
                  <link.icon className="h-4 w-4" />
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
                    pathname === link.href
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
