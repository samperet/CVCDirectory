"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Circle, DirectoryDocument } from "@/lib/directory/types";
import type { DocumentListing } from "@/lib/documents/types";
import type { WikiPageSummary } from "@/lib/wiki/store";

export type PagesResponse = { pages: WikiPageSummary[]; canEdit: boolean };

/** A circle's wiki pages (shared by the wiki index, pages, and links to them). */
export const wikiPagesQuery = (circleId: string) => ({
  queryKey: ["wiki", circleId],
  queryFn: () => apiFetch<PagesResponse>(`/api/circles/${circleId}/wiki`),
});

/** Every circle, from the directory — undefined until it loads. */
export function useCircles(): Circle[] | undefined {
  return useQuery({ queryKey: ["directory"], queryFn: () => apiFetch<DirectoryDocument>("/api/directory") }).data?.circles;
}

/** A document, as much as a link to it needs. */
export interface DocRef {
  id: string;
  title: string;
  circleId: string;
  circleName: string;
}

/** Every document's title (fetched only when something needs them). */
export function useDocTitles(enabled = true) {
  return useQuery({
    queryKey: ["wiki-doc-titles"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DocRef[]> =>
      (await apiFetch<{ documents: DocumentListing[] }>("/api/documents")).documents.map((doc) => ({ id: doc.id, title: doc.title, circleId: doc.circleId, circleName: doc.circleName })),
  });
}

/** The document a `[[doc:…]]` link means: in the named circle, else this circle's, else any circle's. */
export function findDoc(docs: DocRef[], title: string, circleId: string | null, fromCircleId: string) {
  const matches = docs.filter((doc) => doc.title.toLowerCase() === title.toLowerCase());
  if (circleId) return matches.find((doc) => doc.circleId === circleId);
  return matches.find((doc) => doc.circleId === fromCircleId) ?? matches[0];
}

export const docFileUrl = (id: string) => `/api/documents/${id}/file`;
