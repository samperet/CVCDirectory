"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PublicUser } from "@/lib/auth/users";

export type { PublicUser };

export function useSession() {
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<{ user: PublicUser | null; viewAs?: { by: string } | null }>("/api/auth/me"),
    staleTime: 30_000,
  });
  return { user: query.data?.user ?? null, viewAs: query.data?.viewAs ?? null, isLoading: query.isLoading };
}

/**
 * Admins: start or stop viewing the app as another resident. Either way the
 * page reloads, so nothing cached from the other view lingers.
 */
export function useViewAs() {
  return useMutation({
    mutationFn: (personId: string | null) =>
      apiFetch("/api/auth/view-as", personId ? { method: "POST", body: JSON.stringify({ personId }) } : { method: "DELETE" }),
    onSuccess: (_result, personId) => window.location.assign(personId ? "/" : window.location.pathname),
  });
}

function useInvalidateAuth() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["auth"] });
}

export interface SignInPerson {
  id: string;
  name: string;
}

/** Residents who can sign in (those with a phone number on file). */
export function usePeople({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["auth", "people"],
    queryFn: () => apiFetch<{ people: SignInPerson[] }>("/api/auth/people"),
    staleTime: 5 * 60_000,
    enabled,
  });
  return { people: query.data?.people ?? [], isLoading: query.isLoading, error: query.error };
}

/** Reload the signed-in account (e.g. after signing in with `deferSession`). */
export function useRefreshSession() {
  return useInvalidateAuth();
}

/**
 * Sign in. With `deferSession`, the app doesn't switch to the signed-in view
 * until the caller calls `useRefreshSession()` — the sign-in page uses this to
 * finish its logo animation first.
 */
export function useLogin({ deferSession = false }: { deferSession?: boolean } = {}) {
  const invalidate = useInvalidateAuth();
  return useMutation({
    mutationFn: (input: { personId: string; phone: string }) =>
      apiFetch<{ user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: deferSession ? undefined : invalidate,
  });
}

export function useLogout() {
  const invalidate = useInvalidateAuth();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
    onSuccess: invalidate,
  });
}
