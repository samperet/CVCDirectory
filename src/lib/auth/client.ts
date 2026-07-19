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

function useInvalidateAuth() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["auth"] });
}

export function useLogin() {
  const invalidate = useInvalidateAuth();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    onSuccess: invalidate,
  });
}

export function useCreateUser() {
  const invalidate = useInvalidateAuth();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ user: PublicUser }>("/api/users", {
        method: "POST",
        body: JSON.stringify({ name }),
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
