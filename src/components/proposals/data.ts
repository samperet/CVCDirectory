"use client";

import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { NamedPerson } from "@/lib/people";
import type {
  DocumentRef,
  MeetingOption,
  ProposalListing,
  ProposalView,
} from "@/lib/proposals/shared";

/**
 * Proposals in the browser: one query per proposal (each card in a page
 * asks for its own), the list (with the circles you can propose to), and a
 * circle's meetings. Anything that changes a proposal refreshes proposals,
 * pages, and documents — their stages come from it.
 */

export type ProposalsResponse = {
  proposals: ProposalListing[];
  canProposeTo: { id: string; name: string }[];
};

export const proposalQuery = (id: string) => ({
  queryKey: ["proposals", "one", id.toLowerCase()],
  queryFn: () => apiFetch<{ proposal: ProposalView }>(`/api/proposals/${id}`),
});

export const proposalsQuery = (filters: { circle?: string; status?: string; q?: string } = {}) => ({
  queryKey: ["proposals", "list", filters],
  queryFn: () =>
    apiFetch<ProposalsResponse>(
      `/api/proposals?${new URLSearchParams(
        Object.entries(filters).filter((entry): entry is [string, string] => !!entry[1])
      )}`
    ),
});

/** The circles you can put a proposal to. */
export const proposalCirclesQuery = () => ({
  queryKey: ["proposals", "circles"],
  queryFn: () => apiFetch<ProposalsResponse>("/api/proposals?only=circles"),
  staleTime: 60_000,
});

export const meetingsQuery = (circleId: string) => ({
  queryKey: ["proposals", "meetings", circleId],
  queryFn: () =>
    apiFetch<{ meetings: MeetingOption[] }>(`/api/proposals/meetings?circle=${circleId}`),
});

/** What a proposal is sent as, new or changed. */
export type ProposalDraft = {
  circleId: string;
  title: string;
  body: string;
  documents: DocumentRef[];
  decideOn: string | null;
};

/** Consent as it's recorded: at which meeting (or new notes for one on a day), who was there if the notes don't say, and a note. */
export type ConsentDraft = {
  meeting: { kind: "page" | "file"; id: string } | { kind: "new"; date: string };
  present?: NamedPerson[];
  note?: string;
};

/** Refresh everything a proposal's change shows up in. */
export function useProposalsChanged() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["proposals"] });
    void queryClient.invalidateQueries({ queryKey: ["wiki"] });
    void queryClient.invalidateQueries({ queryKey: ["wiki-page"] });
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
  };
}

export const createProposal = (draft: ProposalDraft & { consent?: ConsentDraft }) =>
  apiFetch<{ proposal: ProposalView }>("/api/proposals", {
    method: "POST",
    body: JSON.stringify(draft),
  });

export const changeProposal = (
  id: string,
  change: Partial<ProposalDraft> & { status?: "proposed" | "withdrawn" }
) =>
  apiFetch<{ proposal: ProposalView }>(`/api/proposals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(change),
  });

export const recordConsent = (id: string, consent: ConsentDraft) =>
  apiFetch<{ proposal: ProposalView }>(`/api/proposals/${id}/consent`, {
    method: "POST",
    body: JSON.stringify(consent),
  });

export const withdrawConsent = (id: string) =>
  apiFetch<{ proposal: ProposalView }>(`/api/proposals/${id}/consent`, { method: "DELETE" });

export const deleteProposal = (id: string) =>
  apiFetch(`/api/proposals/${id}`, { method: "DELETE" });
