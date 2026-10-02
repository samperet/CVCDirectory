"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { CvcLogo } from "@/components/auth/cvc-logo";
import { LogoSpin, startLogoSpin } from "@/components/auth/logo-spin";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { useLogin, usePeople, useRefreshSession, useSession } from "@/lib/auth/client";

/** Where to go after signing in: a same-site path from ?next=, never another origin. */
function destination(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !next.startsWith("/login")
    ? next
    : "/";
}

export function LoginClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { user: sessionUser } = useSession();
  const { people, isLoading, error: peopleError } = usePeople();
  const login = useLogin({ deferSession: true });
  const refreshSession = useRefreshSession();
  const logoRef = useRef<HTMLImageElement>(null);
  const spinRef = useRef<LogoSpin | null>(null);
  // From the click until the app switches over (or sign-in fails).
  const [signingIn, setSigningIn] = useState(false);

  const [selected, setSelected] = useState<NameOption | null>(null);
  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Already signed in (or just signed in): continue to where they were headed.
  useEffect(() => {
    if (sessionUser) router.replace(destination());
  }, [sessionUser, router]);

  useEffect(() => () => spinRef.current?.cancel(), []);

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
    // Wind up and spin the logo while signing in.
    spinRef.current?.cancel();
    const spin = logoRef.current ? startLogoSpin(logoRef.current) : null;
    spinRef.current = spin;
    setSigningIn(true);

    login.mutate(
      { personId: selected.id, phone },
      {
        onSuccess: async (response) => {
          setPhone("");
          // Now that the session cookie is set, fetch the next page while the
          // spin winds down. (Before signing in, it would only redirect here.)
          router.prefetch(destination());
          await spin?.finish();
          toast({ title: `Welcome, ${response.user.name}` });
          await refreshSession(); // the app switches over and this page redirects
        },
        onError: (error: Error) => {
          setFormError(error.message);
          setSigningIn(false);
          void spin?.finish();
        },
      }
    );
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-card border border-border bg-surface p-8 shadow-soft">
          <div className="mb-8 text-center">
            <div className="mb-6 flex justify-center">
              <CvcLogo ref={logoRef} size={120} busy={signingIn} />
            </div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">Sign In</h1>
            <p className="text-lg text-muted">Select your name and enter your phone number</p>
          </div>

          {sessionUser ? (
            <p className="text-center text-sm text-muted">Signing you in…</p>
          ) : (
            <form className="flex flex-col gap-6" onSubmit={handleSignIn} noValidate>
              {formError ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {formError}
                </p>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">
                  Your Name
                </label>
                <NameCombobox
                  users={people}
                  value={selected}
                  onChange={setSelected}
                  loading={isLoading}
                  disabled={signingIn}
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
                    disabled={signingIn}
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
                  Your phone number is your password. Dashes, dots, spaces, and parentheses are all
                  fine.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full py-3 text-lg"
                size="lg"
                disabled={signingIn || isLoading}
              >
                {signingIn ? "Signing in…" : "Sign In"}
              </Button>

              <p className="text-center text-sm text-muted">
                Don&apos;t see your name? Only residents with a phone number on the HOA contact list
                can sign in — ask the Board to update your entry.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
