"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import { BackLink } from "@/components/layout/back-link";
import {
  ProposalBadge,
  meetingDate,
  meetingHref,
  meetingsQuery,
  proposalHref,
  useNow,
} from "@/components/meetings/meetings-data";
import { useNewMeeting } from "@/components/meetings/meetings-module";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDirectory } from "@/components/directory/use-directory";
import { Loading, ErrorCard } from "@/components/ui/status";

/** All of a circle's meetings (newest first) and every proposal brought to them. */
export function MeetingsListClient({ circleId }: { circleId: string }) {
  const circle = useDirectory()?.circles.find((entry) => entry.id === circleId);
  const { data, isLoading, error } = useQuery(meetingsQuery(circleId));
  const create = useNewMeeting(circleId);
  const now = useNow();
  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/circles/${circleId}`} label={circle?.name ?? "Circle"} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <ClipboardList className="h-6 w-6 text-primary" aria-hidden />{" "}
          {circle ? `${circle.name} meetings` : "Meetings"}
        </h1>
        {data?.canEdit ? (
          <Button className="gap-1" onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-4 w-4" /> New meeting
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorCard error={error} fallback="Meetings are unavailable." />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-foreground">Minutes</h2>
            {data.meetings.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.meetings.map((meeting) => (
                  <li key={meeting.id}>
                    <Link
                      href={meetingHref(circleId, meeting.id)}
                      className="flex flex-wrap items-baseline gap-x-3 py-2 hover:underline"
                    >
                      <span className="font-medium text-foreground">{meeting.title}</span>
                      <span className="text-sm text-muted">
                        {meetingDate(meeting.date)} ·{" "}
                        {meeting.present === 1 ? "1 present" : `${meeting.present} present`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No minutes yet.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-foreground">Proposals</h2>
            {data.proposals.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.proposals.map((proposal) => (
                  <li key={proposal.id}>
                    <Link
                      href={proposalHref(circleId, proposal.id)}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:underline"
                    >
                      <span className="min-w-0 flex-1 font-medium text-foreground">
                        {proposal.title}
                      </span>
                      <ProposalBadge
                        proposal={proposal}
                        objections={proposal.openObjections}
                        now={now}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No proposals yet.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
