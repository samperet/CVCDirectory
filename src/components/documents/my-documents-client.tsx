"use client";

import Link from "next/link";
import { Clock, Star } from "lucide-react";
import { timeAgo } from "@/lib/time";
import type { MyDocument } from "@/lib/me/shared";
import { BackLink } from "@/components/layout/back-link";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { DOC_ICONS, StarButton, useMyDocuments, useOpenNoter } from "./my-documents";

/**
 * Your starred documents and those you've opened lately
 * (`/documents/mine`), in full — the Documents menu shows five of each.
 * Each can be starred or unstarred here.
 */
export function MyDocumentsClient() {
  const { data, isLoading, error } = useMyDocuments();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <BackLink href="/documents" label="Documents" />
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorCard error={error} />
      ) : (
        <>
          <Card className="flex flex-col gap-3" data-mine-starred>
            <div className="flex flex-col gap-1">
              <SectionHeading icon={Star}>Starred</SectionHeading>
              <p className="text-sm text-muted">
                Pages, files and proposals you&apos;ve starred, the latest first. Star one from its
                page, or a file from its row.
              </p>
            </div>
            {data.starred.length ? (
              <DocumentList docs={data.starred} />
            ) : (
              <p className="text-sm text-muted">Nothing starred yet.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-3" data-mine-recent>
            <SectionHeading icon={Clock}>Opened lately</SectionHeading>
            {data.recent.length ? (
              <DocumentList docs={data.recent} opened />
            ) : (
              <p className="text-sm text-muted">Nothing opened yet.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DocumentList({
  docs,
  opened = false,
}: {
  docs: (MyDocument & { at: string })[];
  opened?: boolean;
}) {
  const noteOpened = useOpenNoter();
  return (
    <ul className="flex flex-col divide-y divide-border">
      {docs.map((doc) => {
        const Icon = DOC_ICONS[doc.kind];
        const title = (
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground hover:underline">
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="break-words">{doc.title}</span>
          </span>
        );
        return (
          <li
            key={`${doc.kind}:${doc.id}`}
            className="flex items-center justify-between gap-2 py-2.5"
            data-mine={`${doc.kind}:${doc.id}`}
          >
            <div className="min-w-0">
              {doc.external ? (
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => noteOpened(doc)}
                >
                  {title}
                </a>
              ) : (
                <Link href={doc.href}>{title}</Link>
              )}
              <p className="pl-[1.375rem] text-xs text-muted">
                {[
                  doc.kind === "page" ? "Page" : doc.kind === "file" ? "File" : "Proposal",
                  doc.circleName,
                  opened ? `opened ${timeAgo(doc.at)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <StarButton doc={doc} title={doc.title} compact />
          </li>
        );
      })}
    </ul>
  );
}
