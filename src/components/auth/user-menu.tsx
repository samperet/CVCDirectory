"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { History, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout, useSession } from "@/lib/auth/client";
import { Avatar } from "@/components/profile/avatar";

export function UserMenu() {
  const router = useRouter();
  const { user } = useSession();
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        router.replace("/login");
      },
    });

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="gap-2 whitespace-nowrap pl-1.5" onClick={() => setOpen((value) => !value)}>
        <Avatar name={user.name} photoUrl={user.photoUrl} size={24} />
        {user.name}
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-card border border-border bg-surface p-3 shadow-elev">
            <p className="px-1 text-sm font-medium text-foreground">{user.name}</p>
            {user.isAdmin ? (
              <p className="flex items-center gap-1 px-1 pt-0.5 text-xs text-muted">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin
              </p>
            ) : null}
            <div className="pb-2" />
            <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
              <Link href="/profile" onClick={() => setOpen(false)}>
                <UserRound className="h-4 w-4" /> Your profile
              </Link>
            </Button>
            {user.isAdmin ? (
              <Button asChild variant="ghost" size="sm" className="mb-1 w-full justify-start gap-2">
                <Link href="/admin/sign-ins" onClick={() => setOpen(false)}>
                  <History className="h-4 w-4" /> Sign-in log
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={signOut} disabled={logout.isPending}>
              <LogOut className="h-4 w-4" />
              {logout.isPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
