"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { CvcLogo } from "@/components/auth/cvc-logo";
import { NameCombobox } from "@/components/auth/name-combobox";
import {
  PublicUser,
  useCreateUser,
  useLogin,
  useRequestMagicLink,
  useSession,
  useUsers,
} from "@/lib/auth/client";

export function LoginClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { user: sessionUser } = useSession();
  const { users, isLoading } = useUsers();
  const login = useLogin();
  const createUser = useCreateUser();
  const magicLink = useRequestMagicLink();

  const [selected, setSelected] = useState<PublicUser | null>(null);
  const [addingName, setAddingName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Once signed in, the card becomes the "get verified" step.
  const signedIn = sessionUser !== null;

  useEffect(() => {
    if (sessionUser && !selected) setSelected(sessionUser);
  }, [sessionUser, selected]);

  const handleSignIn = () => {
    if (!selected) return;
    login.mutate(selected.id, {
      onSuccess: (response) => {
        toast({ title: `Welcome back, ${response.user.name}` });
        if (response.user.verified) router.push("/");
      },
      onError: (error: Error) =>
        toast({ title: "Could not sign in", description: error.message, variant: "destructive" }),
    });
  };

  const handleAdd = () => {
    const name = addingName.trim();
    if (!name) return;
    createUser.mutate(name, {
      onSuccess: (response) => {
        setAddingName("");
        setShowAdd(false);
        setSelected(response.user);
        toast({
          title: `Welcome, ${response.user.name}`,
          description: "You're signed in. Verify your email below to earn a badge.",
        });
      },
      onError: (error: Error) =>
        toast({ title: "Could not add name", description: error.message, variant: "destructive" }),
    });
  };

  const handleMagicLink = () => {
    const value = email.trim();
    if (!value) return;
    magicLink.mutate(value, {
      onSuccess: (response) => {
        if (response.sent) {
          setPreviewUrl(null);
          toast({ title: "Magic link sent", description: `Check ${value} to finish verifying.` });
        } else {
          setPreviewUrl(response.previewUrl ?? null);
        }
      },
      onError: (error: Error) =>
        toast({ title: "Could not send link", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-card border border-border bg-surface p-8 shadow-soft">
          <div className="mb-8 text-center">
            <div className="mb-6 flex justify-center">
              <CvcLogo size={120} />
            </div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">Sign In</h1>
            <p className="text-lg text-muted">
              {signedIn ? "You're signed in" : "Select your name to join the conversation"}
            </p>
          </div>

          {!signedIn ? (
            <div className="flex flex-col gap-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Your Name</label>
                <NameCombobox
                  users={users}
                  value={selected}
                  onChange={setSelected}
                  loading={isLoading}
                />
                <p className="mt-3 text-sm text-muted">
                  No password needed — pick your name and you&apos;re in.
                </p>
              </div>

              <Button
                className="w-full py-3 text-lg"
                size="lg"
                disabled={!selected || login.isPending}
                onClick={handleSignIn}
              >
                {login.isPending ? "Signing in…" : "Sign In"}
              </Button>

              {showAdd ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-accent/50 p-4">
                  <label className="text-sm font-semibold text-foreground">
                    New here? Add your name
                  </label>
                  <Input
                    placeholder="e.g. River W."
                    value={addingName}
                    onChange={(event) => setAddingName(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleAdd()}
                    className="bg-white"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAdd} disabled={createUser.isPending}>
                      {createUser.isPending ? "Adding…" : "Add & sign in"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 text-sm font-medium text-secondary-foreground underline-offset-4 hover:underline"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="h-4 w-4" />
                  Don&apos;t see your name? Add it
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="flex items-center justify-center gap-1.5 text-lg font-semibold text-foreground">
                {sessionUser.name}
                {sessionUser.verified ? <BadgeCheck className="h-5 w-5 text-primary" /> : null}
              </p>

              {sessionUser.verified ? (
                <>
                  <p className="text-center text-sm text-muted">
                    Your account is verified — the badge shows next to your name everywhere.
                  </p>
                  <Button className="w-full" size="lg" onClick={() => router.push("/")}>
                    Continue to the directory
                  </Button>
                </>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/50 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Get your verified badge
                  </p>
                  <p className="text-sm text-muted">
                    We&apos;ll email a magic link. Clicking it proves it&apos;s really you and adds a
                    badge next to your name.
                  </p>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleMagicLink()}
                    className="bg-white"
                  />
                  <Button onClick={handleMagicLink} disabled={magicLink.isPending}>
                    {magicLink.isPending ? "Sending…" : "Send magic link"}
                  </Button>
                  {previewUrl ? (
                    <p className="break-all text-xs text-muted">
                      Email isn&apos;t configured yet, so here&apos;s your link:{" "}
                      <a className="font-medium text-secondary-foreground underline" href={previewUrl}>
                        verify my account
                      </a>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="text-sm text-muted underline-offset-4 hover:underline"
                    onClick={() => router.push("/")}
                  >
                    Skip for now
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
