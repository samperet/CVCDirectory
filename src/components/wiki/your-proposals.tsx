"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { isCommunity } from "@/lib/circles/ids";
import { pageStage } from "@/lib/wiki/consent";
import { shortDate } from "@/lib/time";
import { useCircles } from "@/components/directory/use-directory";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { proposalsQuery } from "@/components/proposals/data";
import { SectionHeading } from "@/components/ui/section-heading";

const SHOWN = 6;

type Waiting = {
  key: string;
  circleId: string;
  title: string;
  href: string;
  decideOn: string | null;
};

/**
 * On the dashboard: the proposals to a circle you're in, waiting for its
 * consent — your own circles' and Community's (everyone is in Community) —
 * the soonest to be decided first, each with its circle above its title.
 * Pages proposed before proposals were their own records come too. Shown
 * only when there are some.
 */
export function YourProposals() {
  const { user } = useSession();
  const proposals = useQuery(proposalsQuery({ status: "proposed" })).data?.proposals;
  const pages = useWikiPages().data?.pages;
  const circles = useCircles();
  if (!user || !proposals || !circles) return null;
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
  const waiting: Waiting[] = [
    ...proposals
      .filter((proposal) => mine.has(proposal.circleId))
      .map((proposal) => ({
        key: proposal.id,
        circleId: proposal.circleId,
        title: proposal.title,
        href: `/proposals/${proposal.id}`,
        decideOn: proposal.decideOn,
      })),
    ...(pages ?? [])
      .filter(
        (page) =>
          pageStage(page) === "proposed" && !page.proposal?.proposalId && mine.has(page.keeper)
      )
      .map((page) => ({
        key: page.id,
        circleId: page.keeper,
        title: page.title,
        href: `/wiki/${page.slug}`,
        decideOn: page.proposal?.decideOn ?? null,
      })),
  ].sort((a, b) => (a.decideOn ?? "9999").localeCompare(b.decideOn ?? "9999"));
  if (!waiting.length) return null;
  return (
    <section
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-soft"
      data-your-proposals
    >
      <SectionHeading icon={Hourglass}>Waiting for consent</SectionHeading>
      <ul className="flex flex-col divide-y divide-border">
        {waiting.slice(0, SHOWN).map((entry) => (
          <li key={entry.key} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <span className="text-xs font-medium text-muted">
              {names.get(entry.circleId) ?? "A circle"}
            </span>
            <Link
              href={entry.href}
              className="break-words font-medium text-foreground hover:underline"
            >
              {entry.title}
            </Link>
            {entry.decideOn ? (
              <span className="whitespace-nowrap text-xs font-medium text-foreground">
                to decide {shortDate(entry.decideOn, true)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {waiting.length > SHOWN ? (
        <Link
          href="/documents?stage=proposed"
          className="w-fit text-xs font-medium text-secondary-foreground hover:underline"
        >
          And {waiting.length - SHOWN} more
        </Link>
      ) : null}
    </section>
  );
}
