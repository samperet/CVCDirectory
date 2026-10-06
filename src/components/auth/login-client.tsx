"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { CvcLogo } from "@/components/auth/cvc-logo";
import { LogoSpin, startLogoSpin } from "@/components/auth/logo-spin";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { JoinRequest } from "@/components/auth/join-request";
import {
  usePeople,
  useRefreshSession,
  useRequestSignInLink,
  useSession,
  useSignIn,
} from "@/lib/auth/client";

/** Where to go after signing in: a same-site path from ?next=, never another origin. */
export function destination(next = new URLSearchParams(window.location.search).get("next")) {
  return next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !next.startsWith("/login")
    ? next
    : "/";
}

/** Spin the logo while signing in; `finish` winds it down. */
export function useLogoSpin() {
  const logoRef = useRef<HTMLImageElement>(null);
  const spinRef = useRef<LogoSpin | null>(null);
  useEffect(() => () => spinRef.current?.cancel(), []);
  const start = () => {
    spinRef.current?.cancel();
    spinRef.current = logoRef.current ? startLogoSpin(logoRef.current) : null;
    return spinRef.current;
  };
  return { logoRef, start };
}

/**
 * Sign in by email: choose your name, and a link (and a six-digit code) goes
 * to your address in the directory. Open the link, or type the code here —
 * the code is for when the link opens somewhere else, like a phone's
 * browser instead of the app on its home screen. While waiting, this page
 * notices a link opened in another tab of the same browser. Someone not in
 * the list can ask to join ("I'm new here", `join-request.tsx`).
 */
export function LoginClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { user: sessionUser } = useSession();
  const { people, isLoading, error: peopleError } = usePeople();
  const request = useRequestSignInLink();
  const signIn = useSignIn({ deferSession: true });
  const refreshSession = useRefreshSession();
  const { logoRef, start } = useLogoSpin();
  // From the click until the app switches over (or sign-in fails).
  const [signingIn, setSigningIn] = useState(false);

  const [selected, setSelected] = useState<NameOption | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // "I'm new here": asking to join instead of signing in.
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Already signed in (or just signed in): continue to where they were headed.
  useEffect(() => {
    if (sessionUser) router.replace(destination());
  }, [sessionUser, router]);

  // Waiting for the email: check now and then whether the link was opened in another tab.
  useEffect(() => {
    if (!sentTo) return;
    const timer = window.setInterval(() => void refreshSession(), 4000);
    return () => window.clearInterval(timer);
  }, [sentTo, refreshSession]);

  // Clear a stale error as soon as the person changes their input.
  useEffect(() => {
    setFormError(null);
  }, [selected, code]);

  const sendLink = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!selected) {
      setFormError("Please select your name");
      return;
    }
    const next = destination();
    request.mutate(
      { personId: selected.id, ...(next !== "/" ? { next } : {}) },
      {
        onSuccess: (response) => {
          setSentTo(response.sentTo);
          setCode("");
        },
        onError: (error: Error) => setFormError(error.message),
      }
    );
  };

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    if (code.replace(/\D/g, "").length !== 6) {
      setFormError("Enter the six-digit code from the email");
      return;
    }
    const spin = start();
    setSigningIn(true);
    signIn.mutate(
      { personId: selected.id, code },
      {
        onSuccess: async (response) => {
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

  const errorNote = formError ? (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {formError}
    </p>
  ) : null;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-card border border-border bg-surface p-8 shadow-soft">
          <div className="mb-8 text-center">
            <div className="mb-6 flex justify-center">
              <CvcLogo ref={logoRef} size={120} busy={signingIn} />
            </div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">
              {joining ? "Join Common Pastures" : "Sign In"}
            </h1>
            <p className="text-lg text-muted">
              {joining
                ? "For residents of CVC"
                : sentTo
                  ? "Check your email"
                  : "Choose your name and we'll email you a link"}
            </p>
          </div>

          {sessionUser ? (
            <p className="text-center text-sm text-muted">Signing you in…</p>
          ) : joining ? (
            <JoinRequest onBack={() => setJoining(false)} />
          ) : sentTo && selected ? (
            <form className="flex flex-col gap-5" onSubmit={submitCode} noValidate>
              <div className="flex gap-3 rounded-lg border border-border bg-accent/40 p-4 text-sm text-foreground">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <p>
                  We sent a sign-in link to <strong>{sentTo}</strong>. Open it on this device, or
                  type the code from the email here.
                </p>
              </div>
              {errorNote}
              <div>
                <label htmlFor="code" className="mb-2 block text-sm font-semibold text-foreground">
                  Code from the email
                </label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123 456"
                  maxLength={9}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={signingIn}
                  className="h-12 bg-white text-center font-mono text-xl tracking-[0.3em]"
                />
              </div>
              <Button type="submit" size="lg" className="w-full py-3 text-lg" disabled={signingIn}>
                {signingIn ? "Signing in…" : "Sign In"}
              </Button>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <button
                  type="button"
                  className="text-secondary-foreground underline underline-offset-4"
                  onClick={() => {
                    setSentTo(null);
                    setFormError(null);
                  }}
                  disabled={signingIn}
                >
                  Not {selected.name}?
                </button>
                <button
                  type="button"
                  className="text-secondary-foreground underline underline-offset-4"
                  onClick={() => sendLink()}
                  disabled={signingIn || request.isPending}
                >
                  {request.isPending ? "Sending…" : "Send another email"}
                </button>
              </div>
              <p className="text-center text-xs text-muted">
                The link and code work once, for 30 minutes. Nothing there? Check your spam folder.
              </p>
            </form>
          ) : (
            <form className="flex flex-col gap-6" onSubmit={sendLink} noValidate>
              {errorNote}
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">
                  Your Name
                </label>
                <NameCombobox
                  users={people}
                  value={selected}
                  onChange={setSelected}
                  loading={isLoading}
                  disabled={request.isPending}
                  placeholder="Start typing your name..."
                />
                {peopleError ? (
                  <p className="mt-2 text-sm text-destructive">{(peopleError as Error).message}</p>
                ) : null}
              </div>

              <Button
                type="submit"
                className="w-full py-3 text-lg"
                size="lg"
                disabled={request.isPending || isLoading}
              >
                {request.isPending ? "Sending…" : "Email me a sign-in link"}
              </Button>

              <div className="flex flex-col items-center gap-2 border-t border-border pt-5 text-center">
                <p className="text-sm text-muted">Don&apos;t see your name in the list?</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setJoining(true)}
                >
                  I&apos;m new here — ask to join
                </Button>
                <p className="text-xs text-muted">
                  The sign-in link goes to your email address in the CVC directory. Changed your
                  email? Ask the Board Secretary to update your entry.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
