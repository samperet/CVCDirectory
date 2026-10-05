"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Link2,
  Presentation,
} from "lucide-react";
import type { LinkKind } from "@/lib/documents/links";
import { apiFetch } from "@/lib/api-client";
import {
  ACCEPTED_EXTENSIONS,
  DocumentListing,
  DocumentTypeOption,
  MAX_DOCUMENT_BYTES,
} from "@/lib/documents/types";

/** Pieces shared by the single and bulk document uploads. */

/** A circle's document types (each circle edits its own). */
export function useCircleTypes(circleId: string) {
  return useQuery({
    queryKey: ["document-types", circleId],
    queryFn: () =>
      apiFetch<{ types: DocumentTypeOption[] }>(`/api/circles/${circleId}/document-types`),
    staleTime: 5 * 60_000,
    enabled: !!circleId,
  });
}

/** A file's icon by its type — or, for a link, by what it links to. */
export function FileIcon({
  contentType,
  link,
  className,
}: {
  contentType: string;
  link?: LinkKind;
  className?: string;
}) {
  if (link) {
    const LinkIcon =
      link === "google-doc"
        ? FileText
        : link === "google-sheet"
          ? FileSpreadsheet
          : link === "google-slides"
            ? Presentation
            : link === "google-form"
              ? ClipboardList
              : link === "google-drive"
                ? File
                : Link2;
    return <LinkIcon className={className} aria-hidden />;
  }
  const Icon = contentType.startsWith("image/")
    ? FileImage
    : /sheet|excel|csv/.test(contentType)
      ? FileSpreadsheet
      : /presentation|powerpoint/.test(contentType)
        ? Presentation
        : /pdf|word|text/.test(contentType)
          ? FileText
          : File;
  return <Icon className={className} aria-hidden />;
}

/**
 * Send a file in pieces (each under the hosting platform's request limit),
 * reporting progress, and return the token that finishes the upload.
 */
export async function sendFile(
  file: File,
  target: { circleId: string; replaces?: string },
  onProgress: (sent: number) => void
) {
  const { token, chunkSize, chunks } = await apiFetch<{
    token: string;
    chunkSize: number;
    chunks: number;
  }>("/api/documents/uploads", {
    method: "POST",
    body: JSON.stringify({
      circleId: target.circleId,
      fileName: file.name,
      size: file.size,
      replaces: target.replaces ?? null,
    }),
  });
  for (let index = 0; index < chunks; index++) {
    const piece = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(`/api/documents/uploads/${index}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "X-Upload-Token": token },
        body: piece,
      }).catch(() => null);
      if (response?.ok) break;
      if (attempt >= 3 || (response && response.status < 500 && response.status !== 429)) {
        const detail = await response
          ?.json()
          .then((body) => body?.detail)
          .catch(() => null);
        throw new Error(
          detail ?? "The upload was interrupted — check your connection and try again."
        );
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    onProgress(Math.min(file.size, (index + 1) * chunkSize));
  }
  return token;
}

export interface NewDocumentDetails {
  title: string;
  type: string;
  meetingDate: string | null;
  description: string | null;
}

/** Upload a new document to a circle: send the file, then save it with its details. */
export async function uploadDocument(
  file: File,
  circleId: string,
  details: NewDocumentDetails,
  onProgress: (progress: { sent: number; finishing: boolean }) => void
) {
  onProgress({ sent: 0, finishing: false });
  const token = await sendFile(file, { circleId }, (sent) =>
    onProgress({ sent, finishing: false })
  );
  onProgress({ sent: file.size, finishing: true });
  const { document } = await apiFetch<{ document: DocumentListing }>("/api/documents", {
    method: "POST",
    body: JSON.stringify({ token, details }),
  });
  return document;
}

/** Why a file can't be uploaded, or null if it can. */
export function checkFile(file: File) {
  if (!ACCEPTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    return "Upload a PDF, Word, Excel, PowerPoint, text, or image file.";
  }
  if (file.size > MAX_DOCUMENT_BYTES) return "Documents must be 50 MB or smaller.";
  if (!file.size) return "That file is empty.";
  return null;
}

/** A starting title from a file's name: "2024-03_board_minutes.pdf" → "2024-03 board minutes". */
export const titleFromFileName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A meeting date in a file's name, e.g. "Board minutes 2024-03-12.pdf" or "2024_03_12 agenda.docx". */
export function dateFromFileName(name: string) {
  const match = name.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) || Number(month) > 12 || Number(day) > 31 ? "" : iso;
}
