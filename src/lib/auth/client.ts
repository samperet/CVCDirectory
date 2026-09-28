"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PublicUser } from "@/lib/auth/users";

export type { PublicUser };

export function useSession() {
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<{ user: PublicUser | null }>("/api/auth/me"),
    staleTime: 30_000,
  });
  return { user: query.data?.user ?? null, isLoading: query.isLoading };
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
export function usePeople() {
  const query = useQuery({
    queryKey: ["auth", "people"],
    queryFn: () => apiFetch<{ people: SignInPerson[] }>("/api/auth/people"),
    staleTime: 5 * 60_000,
  });
  return { people: query.data?.people ?? [], isLoading: query.isLoading, error: query.error };
}

export function useLogin() {
  const invalidate = useInvalidateAuth();
  return useMutation({
    mutationFn: (input: { personId: string; phone: string }) =>
      apiFetch<{ user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useLogout() {
  const invalidate = useInvalidateAuth();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
    onSuccess: invalidate,
  });
}
