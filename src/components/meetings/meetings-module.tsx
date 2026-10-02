"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle } from "@/lib/directory/types";
import { proposalState, type Meeting } from "@/lib/meetings/shared";
import { ModuleToggle } from "@/components/circles/circle-modules";
import { ProposalBadge, meetingDate, meetingHref, meetingsQuery, proposalHref, useNow } from "@/components/meetings/meetings-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

const SHOWN = 5;

/** Start a meeting's minutes, then open them. */
export function useNewMeeting(circleId: string) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ meeting: Meeting }>(`/api/circles/${circleId}/meetings`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: ({ meeting }) => {
      queryClient.invalidateQueries({ queryKey: ["meetings", circleId] });
      router.push(meetingHref(circleId, meeting.id));
    },
    onError: (err: Error) => toast({ title: "Could not start the minutes", description: err.message, variant: "destructive" }),
  });
}

/**
 * The circle's meetings on its page: proposals in their review (and how long
 * each has left), then the latest meetings' minutes. Members start a new
 * meeting's minutes here.
 */
export function MeetingsModule({ circle, title }: { circle: Circle; title: string }) {
  const { data, isLoading } = useQuery(meetingsQuery(circle.id));
  const create = useNewMeeting(circle.id);
  const now = useNow();
  const open = (data?.proposals ?? []).filter((proposal) => ["review", "paused"].includes(proposalState(proposal, now)));
  const meetings = data?.meetings ?? [];
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <ModuleToggle />
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden /> {title}
        </h2>
        {data?.canEdit ? (
          <Button className="gap-1" onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-4 w-4" /> {create.isPending ? "Starting…" : "New meeting"}
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          {open.length ? (
            <section className="flex flex-col gap-1.5" aria-label="Proposals in review">
              <h3 className="text-sm font-semibold text-foreground">Proposals in review</h3>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-white">
                {open.map((proposal) => (
                  <li key={proposal.id}>
                    <Link href={proposalHref(circle.id, proposal.id)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-accent/50">
                      <span className="min-w-0 flex-1 font-medium text-foreground">{proposal.title}</span>
                      <ProposalBadge proposal={proposal} objections={proposal.openObjections} now={now} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {meetings.length ? (
            <ul className="flex flex-col divide-y divide-border" aria-label="Meetings">
              {meetings.slice(0, SHOWN).map((meeting) => (
                <li key={meeting.id}>
                  <Link href={meetingHref(circle.id, meeting.id)} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 hover:underline">
                    <span className="font-medium text-foreground">{meeting.title}</span>
                    <span className="text-sm text-muted">
                      {meetingDate(meeting.date)} · {meeting.present === 1 ? "1 present" : `${meeting.present} present`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{data?.canEdit ? "No minutes yet — start them at your next meeting." : "No minutes yet."}</p>
          )}
          {meetings.length > SHOWN || (data?.proposals.length ?? 0) > open.length ? (
            <Link href={`/circles/${circle.id}/meetings`} className="w-fit border-t border-border pt-3 text-sm font-medium text-secondary-foreground hover:underline">
              All meetings and proposals
            </Link>
          ) : null}
        </>
      )}
    </Card>
  );
}
