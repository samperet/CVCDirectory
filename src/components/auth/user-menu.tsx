"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, LogOut, Plus, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { VerifiedBadge } from "@/components/auth/verified-badge";
import {
  useCreateUser,
  useLogin,
  useLogout,
  useRequestMagicLink,
  useSession,
  useUsers,
} from "@/lib/auth/client";

export function UserMenu() {
  const { toast } = useToast();
  const { user, isLoading } = useSession();
  const { users } = useUsers();
  const login = useLogin();
  const createUser = useCreateUser();
  const logout = useLogout();
  const magicLink = useRequestMagicLink();

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
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

  const closePanel = () => {
    setOpen(false);
    setPreviewUrl(null);
  };

  const handleLogin = (userId: string) => {
    login.mutate(userId, {
      onSuccess: (response) => {
        closePanel();
        toast({ title: `Welcome back, ${response.user.name}` });
      },
      onError: (error) => toast({ title: "Could not sign in", description: String(error), variant: "destructive" }),
    });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createUser.mutate(name, {
      onSuccess: (response) => {
        setNewName("");
        closePanel();
        toast({
          title: `Welcome, ${response.user.name}`,
          description: "You're signed in. Verify your email from the account menu to earn a verified badge.",
        });
      },
      onError: (error) => toast({ title: "Could not add name", description: String(error), variant: "destructive" }),
    });
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
      onError: (error) =>
        toast({ title: "Could not send magic link", description: String(error), variant: "destructive" }),
    });
  };

  return (
    <div className="relative">
      {user ? (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen((value) => !value)}>
          <UserCircle2 className="h-4 w-4" />
          {user.name}
          {user.verified ? <VerifiedBadge /> : null}
        </Button>
      ) : (
        <Button size="sm" className="gap-2" onClick={() => setOpen((value) => !value)}>
          <UserCircle2 className="h-4 w-4" />
          Sign in
        </Button>
      )}

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={closePanel} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-background p-4 shadow-soft">
            {user ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {user.name}
                    {user.verified ? <VerifiedBadge /> : null}
                  </p>
                  <p className="text-xs text-foreground/60">
                    {user.verified
                      ? "Verified member"
                      : "Not verified yet — verify your email to earn a badge."}
                  </p>
                </div>

                {!user.verified ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <BadgeCheck className="h-4 w-4 text-emerald-600" />
                      Get your verified badge
                    </p>
                    <p className="text-xs text-foreground/60">
                      We&apos;ll email you a magic link. Clicking it proves it&apos;s really you.
                    </p>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && handleMagicLink()}
                    />
                    <Button size="sm" onClick={handleMagicLink} disabled={magicLink.isPending}>
                      {magicLink.isPending ? "Sending…" : "Send magic link"}
                    </Button>
                    {previewUrl ? (
                      <p className="break-all text-xs text-foreground/70">
                        Email delivery isn&apos;t configured yet, so here is your link directly:{" "}
                        <a className="font-medium text-primary underline" href={previewUrl}>
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
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-foreground">Who are you?</p>
                {users.length ? (
                  <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                    {users.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent"
                        onClick={() => handleLogin(candidate.id)}
                      >
                        {candidate.name}
                        {candidate.verified ? <VerifiedBadge /> : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-foreground/60">No names yet — add yours below.</p>
                )}
                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <Input
                    placeholder="Add your name"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleCreate()}
                  />
                  <Button size="sm" className="gap-1" onClick={handleCreate} disabled={createUser.isPending}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
