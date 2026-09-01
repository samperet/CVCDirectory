"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, LogOut, ShieldCheck, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { VerifiedBadge } from "@/components/auth/verified-badge";
import { useLogout, useRequestMagicLink, useSession } from "@/lib/auth/client";

export function UserMenu() {
  const { toast } = useToast();
  const { user, isLoading } = useSession();
  const logout = useLogout();
  const magicLink = useRequestMagicLink();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Magic-link redirects land on /?verification=success|failed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verification = params.get("verification");
    if (!verification) return;
    if (verification === "success") {
      toast({
        title: "Email verified",
        description: "You're signed in and your name now carries a verified badge.",
      });
    } else {
      toast({
        title: "Verification failed",
        description: "That link is invalid or expired. Request a new one from the account menu.",
        variant: "destructive",
      });
    }
    params.delete("verification");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [toast]);

  if (isLoading) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-accent" aria-hidden />;
  }

  if (!user) {
    return (
      <Button asChild size="sm" className="gap-2">
        <Link href="/login">
          <UserCircle2 className="h-4 w-4" />
          Sign in
        </Link>
      </Button>
    );
  }

  const closePanel = () => {
    setOpen(false);
    setPreviewUrl(null);
  };

  const handleMagicLink = () => {
    const value = email.trim();
    if (!value) return;
    magicLink.mutate(value, {
      onSuccess: (response) => {
        if (response.sent) {
          setPreviewUrl(null);
          toast({
            title: "Magic link sent",
            description: `Check ${value} and click the link to verify your account.`,
          });
        } else {
          setPreviewUrl(response.previewUrl ?? null);
        }
      },
      onError: (error: Error) =>
        toast({ title: "Could not send magic link", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen((value) => !value)}>
        <UserCircle2 className="h-4 w-4" />
        {user.name}
        {user.verified ? <VerifiedBadge /> : null}
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={closePanel} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-card border border-border bg-surface p-4 shadow-elev">
            <div className="flex flex-col gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {user.name}
                  {user.verified ? <BadgeCheck className="h-4 w-4 text-primary" /> : null}
                </p>
                <p className="text-xs text-muted">
                  {user.verified ? "Verified member" : "Not verified yet — verify to earn a badge."}
                </p>
              </div>

              {!user.verified ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-accent/50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Get your verified badge
                  </p>
                  <p className="text-xs text-muted">
                    We&apos;ll email you a magic link. Clicking it proves it&apos;s really you.
                  </p>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleMagicLink()}
                    className="bg-white"
                  />
                  <Button size="sm" onClick={handleMagicLink} disabled={magicLink.isPending}>
                    {magicLink.isPending ? "Sending…" : "Send magic link"}
                  </Button>
                  {previewUrl ? (
                    <p className="break-all text-xs text-muted">
                      Email delivery isn&apos;t configured yet, so here is your link directly:{" "}
                      <a className="font-medium text-secondary-foreground underline" href={previewUrl}>
                        verify my account
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => logout.mutate(undefined, { onSuccess: closePanel })}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
