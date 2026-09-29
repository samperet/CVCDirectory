"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { DirectoryDocument } from "@/lib/directory/types";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Card } from "@/components/ui/card";

/** Every circle's documents in one place, searchable by title and contents. */
export function DocumentsPage() {
  const { data } = useQuery({ queryKey: ["directory"], queryFn: () => apiFetch<DirectoryDocument>("/api/directory") });
  const circles = (data?.circles ?? []).map((circle) => ({ id: circle.id, name: circle.name })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
        <p className="text-sm text-muted">
          Minutes, agendas, policies, and more from every circle. Search finds words inside documents, too. Circles add
          documents on their own pages; community-wide ones are the Board&apos;s.
        </p>
      </div>
      <Card>
        <DocumentsPanel circles={circles} />
      </Card>
    </div>
  );
}
