"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu, Users2, Share2, Layers, Grid, Sparkles, Vote } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/user-menu";

const links = [
  { href: "/", label: "Dashboard", icon: Grid },
  { href: "/members", label: "Members", icon: Users2 },
  { href: "/circles", label: "Circles", icon: Layers },
  { href: "/library", label: "Loan Library", icon: Share2 },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/proposals", label: "Proposals", icon: Vote },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="text-lg font-semibold text-foreground">
            CVC Directory
          </Link>
          <div className="flex items-center gap-2 md:hidden">
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
          <div className="hidden items-center gap-3 md:flex">
            <nav className="flex gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
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
          <div className="border-t border-border bg-background px-4 pb-4 pt-2 md:hidden">
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
      <main className="mx-auto flex max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
        {children}
      </main>
    </div>
  );
}
