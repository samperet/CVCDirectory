"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { DocumentListing } from "@/lib/documents/types";
import { spreadsheetKind } from "@/lib/documents/sheets";
import { BackLink } from "@/components/layout/back-link";
import { ErrorCard, Loading, NotFoundCard } from "@/components/ui/status";
import { useNoteOpened } from "@/components/documents/my-documents";

// The spreadsheet editor is large and runs in the browser only.
const SheetEditor = dynamic(
  () => import("@/components/documents/sheet-editor").then((module) => module.SheetEditor),
  { ssr: false, loading: () => <Loading /> }
);

/**
 * A spreadsheet file opened in CVC (`/documents/<id>/sheet`): an Excel
 * `.xlsx` or a `.csv` from a circle's documents, edited in place
 * (`sheet-editor.tsx`) by those who can change the circle's files, and
 * looked at by everyone else.
 */
export function SheetPage({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["document", id],
    queryFn: () => apiFetch<{ document: DocumentListing }>(`/api/documents/${id}`),
  });
  const doc = data?.document;
  useNoteOpened(doc ? { kind: "file", id: doc.id } : null);
  if (isLoading) return <Loading />;
  if (error || !doc)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <BackLink href="/documents" label="Documents" />
        {error && (error as { status?: number }).status !== 404 ? (
          <ErrorCard error={error} />
        ) : (
          <NotFoundCard error={error} message="That spreadsheet wasn't found." />
        )}
      </div>
    );
  const version = doc.versions[doc.versions.length - 1];
  const kind = version.link ? null : spreadsheetKind(version.fileName);
  if (!kind)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <BackLink href="/documents" label="Documents" />
        <NotFoundCard message="That document isn't a spreadsheet CVC can open (an .xlsx or .csv file)." />
      </div>
    );
  return <SheetEditor doc={doc} kind={kind} />;
}
