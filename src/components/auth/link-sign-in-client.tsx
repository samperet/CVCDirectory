"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRefreshSession, useSession, useSignIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";
import { CvcLogo } from "@/components/auth/cvc-logo";
import { destination, useLogoSpin } from "@/components/auth/login-client";

/**
 * A link works once, so it's posted once per page load. The layout around
 * this page changes the moment the sign-in lands, mounting the page afresh,
 * so the attempt is kept here rather than in the component.
 */
const attempts = new Map<string, Promise<unknown>>();

/**
 * The page a sign-in link opens: it signs in straight away and goes on to
 * the dashboard (or wherever the link was asked for). The page posts the
 * token once it has loaded — fetching the page alone, as many mail scanners
 * do, uses nothing up.
 */
export function LinkSignInClient({ token }: { token: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();
  const signIn = useSignIn({ deferSession: true });
  const refreshSession = useRefreshSession();
  const { logoRef, start } = useLogoSpin();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let attempt = attempts.get(token);
    if (!attempt) {
      // The first mount signs in and goes on, even if the page is mounted again meanwhile.
      const spin = start();
      const signingIn = signIn.mutateAsync({ token });
      attempts.set(token, signingIn);
      attempt = signingIn;
      signingIn.then(
        async (response) => {
          const next = destination(response.next);
          router.prefetch(next);
          await spin?.finish();
          toast({ title: `Welcome, ${response.user.name}` });
          await refreshSession();
          router.replace(next);
        },
        () => void spin?.finish()
      );
    }
    // Whichever mount is showing says why it failed.
    attempt.catch((error: Error) => mounted && setFailed(error.message));
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8 text-center shadow-soft">
        <div className="mb-6 flex justify-center">
          <CvcLogo ref={logoRef} size={120} busy={!failed} />
        </div>
        {failed ? (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-bold text-foreground">This link can&apos;t be used</h1>
            <p className="text-muted" role="alert">
              {failed}
            </p>
            {/* Already signed in (an old link clicked again): carry on. */}
            <Button asChild size="lg">
              {user ? (
                <Link href="/">Go to the dashboard</Link>
              ) : (
                <Link href="/login">Ask for a new link</Link>
              )}
            </Button>
          </div>
        ) : (
          <Loading>Signing you in…</Loading>
        )}
      </div>
    </div>
  );
}
