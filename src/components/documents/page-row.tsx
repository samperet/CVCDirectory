"use client";

import Link from "next/link";
import { BadgeCheck, BookOpen, Lock } from "lucide-react";
import type { PageListing } from "@/lib/wiki/listing";
import { shortDate, timeAgo } from "@/lib/time";
import { Highlighted } from "@/components/documents/document-row";

/**
 * A written page in the Documents list, beside uploaded files: a book
 * instead of a file icon and a "Page" label instead of a file type, its
 * consent, circle, and when it was last edited, then its opening lines —
 * or, in a search, the passage that matched. Its title opens the page.
 */
export function PageListingRow({
  page,
  terms,
  showCircle,
}: {
  page: PageListing;
  terms: string[];
  showCircle: boolean;
}) {
  const text = page.snippet ?? page.excerpt;
  return (
    <li className="flex flex-col gap-1 py-4" data-listing="page">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <Link
          href={`/wiki/${page.slug}`}
          className="min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Highlighted text={page.title} terms={terms} />
        </Link>
        {page.restricted ? (
          <Lock
            className="mt-1 h-3.5 w-3.5 shrink-0 text-muted"
            aria-label="Not everyone can see this page"
          />
        ) : null}
      </div>
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-8 text-xs text-muted">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-pine">Page</span>
        {page.consent === "consented" ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pine/10 px-2 py-0.5 font-semibold text-pine"
            title={page.consentDate ? `Consented ${shortDate(page.consentDate, true)}` : undefined}
          >
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented
          </span>
        ) : page.consent === "changed" ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun/15 px-2 py-0.5 font-medium text-[#7a5200]"
            title="Edited since the circle consented"
          >
            <span className="sm:hidden">Changed</span>
            <span className="hidden sm:inline">Changed since consent</span>
          </span>
        ) : null}
        {showCircle ? (
          <Link
            href={`/circles/${page.circleId}#documents`}
            className="font-medium hover:text-foreground hover:underline"
          >
            {page.circleName}
          </Link>
        ) : null}
        <span className="whitespace-nowrap" title={shortDate(page.updatedAt, true)}>
          edited {timeAgo(page.updatedAt)} by {page.updatedBy}
        </span>
      </p>
      {text ? (
        <p
          className={
            page.snippet
              ? "ml-8 rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light"
              : "ml-8 line-clamp-2 text-sm text-foreground-light"
          }
        >
          <Highlighted text={text} terms={terms} />
        </p>
      ) : null}
    </li>
  );
}
