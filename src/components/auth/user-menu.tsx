"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Bug,
  Eye,
  EyeOff,
  Globe,
  History,
  Home,
  LogOut,
  Mail,
  NotebookPen,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout, usePeople, useSession, useViewAs } from "@/lib/auth/client";
import { NameCombobox } from "@/components/auth/name-combobox";
import { useToast } from "@/components/ui/use-toast";
import { Avatar } from "@/components/profile/avatar";

export function UserMenu() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, viewAs } = useSession();
  const logout = useLogout();
  const view = useViewAs();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  // Residents who can sign in, for "View as" (only loaded once an admin opens the picker).
  const { people, isLoading: peopleLoading } = usePeople({ enabled: picking });

  if (!user) return null;

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        router.replace("/login");
      },
    });

  return (
    // On phones the menu hangs from the header's right edge (the button isn't at the edge), so it fits.
    <div className="sm:relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-2 whitespace-nowrap pl-1.5"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Account menu for ${user.name}`}
      >
        <Avatar name={user.name} photoUrl={user.photoUrl} size={24} />
        <span>{user.name}</span>
      </Button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setPicking(false);
            }}
            aria-hidden
          />
          <div className="absolute right-4 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-card sm:right-0 sm:top-auto sm:mt-2 border border-border bg-surface p-3 shadow-elev">
            <p className="px-1 text-sm font-medium text-foreground">{user.name}</p>
            {user.isAdmin ? (
              <p className="flex items-center gap-1 px-1 pt-0.5 text-xs text-muted">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin
              </p>
            ) : null}
            {viewAs ? (
              <p className="flex items-center gap-1 px-1 pt-0.5 text-xs text-muted">
                <Eye className="h-3.5 w-3.5" /> Viewing as them · you&apos;re {viewAs.by}
              </p>
            ) : null}
            <div className="pb-2" />
            <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
              <Link href="/profile" onClick={() => setOpen(false)}>
                <UserRound className="h-4 w-4" /> Your profile
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
              <Link href="/profile#app" onClick={() => setOpen(false)}>
                <Bell className="h-4 w-4" /> App &amp; notifications
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
              <Link href="/welcome" onClick={() => setOpen(false)}>
                <Globe className="h-4 w-4" /> Public homepage
              </Link>
            </Button>
            {user.canManageDirectory ? (
              <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
                <Link href="/secretary" onClick={() => setOpen(false)}>
                  <NotebookPen className="h-4 w-4" /> Secretary
                </Link>
              </Button>
            ) : null}
            {user.canManageHomes ? (
              <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
                <Link href="/homes-for-sale" onClick={() => setOpen(false)}>
                  <Home className="h-4 w-4" /> Homes for sale
                </Link>
              </Button>
            ) : null}
            {user.isAdmin ? (
              <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
                <Link href="/admin/sign-ins" onClick={() => setOpen(false)}>
                  <History className="h-4 w-4" /> Sign-in log
                </Link>
              </Button>
            ) : null}
            {user.isAdmin ? (
              <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
                <Link href="/admin/feedback" onClick={() => setOpen(false)}>
                  <Bug className="h-4 w-4" /> Bugs &amp; requests
                </Link>
              </Button>
            ) : null}
            {user.isAdmin ? (
              <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
                <Link href="/admin/email" onClick={() => setOpen(false)}>
                  <Mail className="h-4 w-4" /> Email
                </Link>
              </Button>
            ) : null}
            {user.isAdmin && !viewAs ? (
              picking ? (
                <div className="mb-2 flex flex-col gap-1.5 rounded-lg border border-border bg-accent/40 p-2">
                  <p className="text-xs text-muted">
                    See the app as this resident does (read-only):
                  </p>
                  <NameCombobox
                    users={people.filter((person) => person.id !== user.personId)}
                    value={null}
                    loading={peopleLoading}
                    disabled={view.isPending}
                    placeholder="Choose a resident…"
                    onChange={(person) =>
                      view.mutate(person.id, {
                        onError: (err) =>
                          toast({
                            title: "Could not switch view",
                            description: (err as Error).message,
                            variant: "destructive",
                          }),
                      })
                    }
                  />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-1 w-full justify-start gap-2"
                  onClick={() => setPicking(true)}
                >
                  <Eye className="h-4 w-4" /> View as resident…
                </Button>
              )
            ) : null}
            {viewAs ? (
              <Button
                variant="ghost"
                size="sm"
                className="mb-1 w-full justify-start gap-2"
                onClick={() => view.mutate(null)}
                disabled={view.isPending}
              >
                <EyeOff className="h-4 w-4" /> Exit view
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={signOut}
              disabled={logout.isPending}
            >
              <LogOut className="h-4 w-4" />
              {logout.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
