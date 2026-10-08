"use client";

import { useCallback } from "react";
import { keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, statusOf } from "@/lib/api-client";
import { RECEIPT_PART_BYTES, type Budget, type FinancesView } from "@/lib/finances/shared";
import type { NamedPerson } from "@/lib/people";
import { useDirectory } from "@/components/directory/use-directory";
import { useToast } from "@/components/ui/use-toast";

/**
 * A circle's finances from the API, a year at a time (`["finances",
 * circleId, year]`; changes refresh `["finances", circleId]`). A 403 —
 * the module is for the circle's members and the Board — or a 404 (no
 * Finances module saved yet) is an answer, not a hiccup, so it isn't
 * asked again.
 */
export const financesQuery = (circleId: string, year: string) => ({
  queryKey: ["finances", circleId, year],
  queryFn: () =>
    apiFetch<FinancesView>(`/api/circles/${circleId}/finances?year=${encodeURIComponent(year)}`),
  retry: (failures: number, error: Error) =>
    failures < 1 && statusOf(error) !== 403 && statusOf(error) !== 404,
  placeholderData: keepPreviousData,
});

export const financesUrl = (circleId: string) => `/api/circles/${circleId}/finances`;

/** Refresh every year of a circle's finances. */
export function useRefreshFinances(circleId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["finances", circleId] }),
    [queryClient, circleId]
  );
}

/** Set a year's budget (in cents), or take it away (null). */
export function useSetBudget(circleId: string) {
  const { toast } = useToast();
  const refresh = useRefreshFinances(circleId);
  return useMutation({
    mutationFn: (input: { year: string; amount: number | null; note: string | null }) =>
      apiFetch<{ budget: Budget | null }>(`${financesUrl(circleId)}/budget`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
    onError: (error: Error) =>
      toast({
        title: "Could not save the budget",
        description: error.message,
        variant: "destructive",
      }),
  });
}

/**
 * Send a receipt (a prepared photo, or a PDF) as the raw request body. One
 * larger than `RECEIPT_PART_BYTES` goes in pieces, one after another, which
 * the server puts back together when the last arrives.
 */
export async function uploadReceipt(url: string, file: Blob, name: string) {
  const send = async (body: Blob, extra: Record<string, string> = {}) => {
    const query = new URLSearchParams({ name, ...extra });
    const res = await fetch(`${url}?${query}`, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body,
    });
    if (!res.ok) {
      const detail = await res
        .json()
        .then((body) => body?.detail as string | undefined)
        .catch(() => undefined);
      throw new Error(detail ?? "The receipt didn't upload");
    }
  };
  if (file.size <= RECEIPT_PART_BYTES) return send(file);
  const parts = Math.ceil(file.size / RECEIPT_PART_BYTES);
  const upload = crypto.randomUUID();
  for (let part = 0; part < parts; part++)
    await send(file.slice(part * RECEIPT_PART_BYTES, (part + 1) * RECEIPT_PART_BYTES), {
      upload,
      part: String(part),
      parts: String(parts),
    });
}

/** Someone's name as shown now: a resident's from the directory, anyone else's as written down. */
export function useNameOf() {
  const directory = useDirectory();
  return useCallback(
    (person: NamedPerson) =>
      (person.personId &&
        directory?.people.find((entry) => entry.id === person.personId)?.displayName) ||
      person.name,
    [directory]
  );
}
