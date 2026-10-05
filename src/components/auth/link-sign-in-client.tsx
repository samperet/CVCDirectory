"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useRefreshSession, useSession, useSignIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";
import { CvcLogo } from "@/components/auth/cvc-logo";
import { destination, useLogoSpin } from "@/components/auth/login-client";

/**
 * The page a sign-in link opens. Opening it signs nobody in (mail scanners
 * open links too); the button does, once.
 */
export function LinkSignInClient({ token }: { token: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();
  const signIn = useSignIn({ deferSession: true });
  const refreshSession = useRefreshSession();
  const { logoRef, start } = useLogoSpin();
  const [signingIn, setSigningIn] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const link = useQuery({
    queryKey: ["sign-in-link", token],
    queryFn: () => apiFetch<{ name: string }>(`/api/auth/link/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
  });

  const go = () => {
    const spin = start();
    setSigningIn(true);
    signIn.mutate(
      { token },
      {
        onSuccess: async (response) => {
          const next = destination(response.next);
          router.prefetch(next);
          await spin?.finish();
          toast({ title: `Welcome, ${response.user.name}` });
          await refreshSession();
          router.replace(next);
        },
        onError: (error: Error) => {
          setFailed(error.message);
          setSigningIn(false);
          void spin?.finish();
        },
      }
    );
  };

  const problem = failed ?? (link.error ? (link.error as Error).message : null);
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8 text-center shadow-soft">
        <div className="mb-6 flex justify-center">
          <CvcLogo ref={logoRef} size={120} busy={signingIn} />
        </div>
        {link.isLoading ? (
          <Loading>Checking your link…</Loading>
        ) : problem ? (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-bold text-foreground">This link can&apos;t be used</h1>
            <p className="text-muted" role="alert">
              {problem}
            </p>
            <Button asChild size="lg">
              <Link href="/login">Ask for a new link</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-bold text-foreground">Sign In</h1>
            <p className="text-lg text-muted">
              {user && user.name !== link.data?.name
                ? `You're signed in as ${user.name}. Sign in as ${link.data?.name} instead?`
                : "Welcome back to Common Pastures."}
            </p>
            <Button size="lg" className="w-full py-3 text-lg" onClick={go} disabled={signingIn}>
              {signingIn ? "Signing in…" : `Sign in as ${link.data?.name}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
