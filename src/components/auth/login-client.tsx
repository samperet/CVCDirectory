"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { CvcLogo } from "@/components/auth/cvc-logo";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { useLogin, usePeople, useRequestMagicLink, useSession } from "@/lib/auth/client";

export function LoginClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { user: sessionUser } = useSession();
  const { people, isLoading, error: peopleError } = usePeople();
  const login = useLogin();
  const magicLink = useRequestMagicLink();

  const [selected, setSelected] = useState<NameOption | null>(null);
  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const signedIn = sessionUser !== null;

  // Clear a stale error as soon as the person changes their input.
  useEffect(() => {
    setFormError(null);
  }, [selected, phone]);

  const handleSignIn = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setFormError("Please select your name");
      return;
    }
    if (!phone.trim()) {
      setFormError("Please enter your phone number");
      return;
    }
    login.mutate(
      { personId: selected.id, phone },
      {
        onSuccess: (response) => {
          setPhone("");
          toast({ title: `Welcome, ${response.user.name}` });
          if (response.user.verified) router.push("/");
        },
        onError: (error: Error) => setFormError(error.message),
      }
    );
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
              {signedIn ? "You're signed in" : "Select your name and enter your phone number"}
            </p>
          </div>

          {!signedIn ? (
            <form className="flex flex-col gap-6" onSubmit={handleSignIn} noValidate>
              {formError ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Your Name</label>
                <NameCombobox
                  users={people}
                  value={selected}
                  onChange={setSelected}
                  loading={isLoading}
                  disabled={login.isPending}
                  placeholder="Start typing your name..."
                />
                {peopleError ? (
                  <p className="mt-2 text-sm text-destructive">{(peopleError as Error).message}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-foreground">
                  Phone Number
                </label>
                <div className="relative">
                  <Input
                    id="phone"
                    type={showPhone ? "text" : "password"}
                    inputMode="tel"
                    autoComplete="current-password"
                    placeholder="e.g. 802-555-1234"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    disabled={login.isPending}
                    className="h-12 bg-white pr-11 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPhone((value) => !value)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-foreground"
                    aria-label={showPhone ? "Hide phone number" : "Show phone number"}
                  >
                    {showPhone ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-3 text-sm text-muted">
                  Your phone number is your password. Dashes, dots, spaces, and parentheses are all fine.
                </p>
              </div>

              <Button type="submit" className="w-full py-3 text-lg" size="lg" disabled={login.isPending || isLoading}>
                {login.isPending ? "Signing in…" : "Sign In"}
              </Button>

              <p className="text-center text-sm text-muted">
                Don&apos;t see your name? Only residents with a phone number on the HOA contact list can sign
                in — ask the Board to update your entry.
              </p>
            </form>
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
                    We&apos;ll email a magic link. Clicking it proves it&apos;s really you and adds a badge next
                    to your name.
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
