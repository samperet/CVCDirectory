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

export function useUsers() {
  const query = useQuery({
    queryKey: ["auth", "users"],
    queryFn: () => apiFetch<{ users: PublicUser[] }>("/api/users"),
    staleTime: 30_000,
  });
  return { users: query.data?.users ?? [], isLoading: query.isLoading };
}

export function useVerifiedNames(): Set<string> {
  const { users } = useUsers();
  return new Set(users.filter((user) => user.verified).map((user) => user.name.toLowerCase()));
}

/** Ids of verified users — for badging authors by account rather than by name. */
export function useVerifiedIds(): Set<string> {
  const { users } = useUsers();
  return new Set(users.filter((user) => user.verified).map((user) => user.id));
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

export function useRequestMagicLink() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<{ sent: boolean; previewUrl?: string }>("/api/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
  });
}
