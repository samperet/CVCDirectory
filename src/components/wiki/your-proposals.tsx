"use client";

import Link from "next/link";
import { Hourglass } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { isCommunity } from "@/lib/circles/ids";
import { byDecision, consentState, pageStage } from "@/lib/wiki/consent";
import { shortDate } from "@/lib/time";
import { useCircles } from "@/components/directory/use-directory";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { SectionHeading } from "@/components/ui/section-heading";

const SHOWN = 6;

/**
 * On the dashboard: the pages proposed to a circle you're in, waiting for its
 * consent — your own circles' and Community's (everyone is in Community) —
 * the soonest to be decided first: each with its circle above its title.
 * Shown only when there are some; only pages you can see.
 */
export function YourProposals() {
  const { user } = useSession();
  const { data } = useWikiPages();
  const circles = useCircles();
  if (!user || !data || !circles) return null;
  const names = new Map(circles.map((circle) => [circle.id, circle.name]));
  const mine = new Set(
    circles
      .filter(
        (circle) =>
          isCommunity(circle.id) ||
          (!!user.personId && circle.seats.some((seat) => seat.personId === user.personId))
      )
      .map((circle) => circle.id)
  );
  const proposals = data.pages
    .filter(
      (page) =>
        pageStage(page) === "proposed" && (mine.has(page.keeper) || isCommunity(page.keeper))
    )
    .sort(byDecision);
  if (!proposals.length) return null;
  return (
    <section
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-soft"
      data-your-proposals
    >
      <SectionHeading icon={Hourglass}>Waiting for consent</SectionHeading>
      <ul className="flex flex-col divide-y divide-border">
        {proposals.slice(0, SHOWN).map((page) => (
          <li key={page.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <span className="text-xs font-medium text-muted">
              {names.get(page.keeper) ?? "A circle"}
            </span>
            <Link
              href={`/wiki/${page.slug}`}
              className="break-words font-medium text-foreground hover:underline"
            >
              {page.title}
            </Link>
            {consentState(page) === "changed" || page.proposal?.decideOn ? (
              <span className="flex flex-wrap items-center gap-2 text-xs">
                {consentState(page) === "changed" ? (
                  <span className="rounded-full bg-sun/30 px-2 py-0.5 font-semibold text-foreground">
                    Proposed change
                  </span>
                ) : null}
                {page.proposal?.decideOn ? (
                  <span className="whitespace-nowrap font-medium text-foreground">
                    to decide {shortDate(page.proposal.decideOn, true)}
                  </span>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {proposals.length > SHOWN ? (
        <Link
          href="/documents?stage=proposed"
          className="w-fit text-xs font-medium text-secondary-foreground hover:underline"
        >
          And {proposals.length - SHOWN} more
        </Link>
      ) : null}
    </section>
  );
}
