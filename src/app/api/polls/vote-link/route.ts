import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { canManageCircle } from "@/lib/circles/icons";
import { readDirectory } from "@/lib/directory/store";
import { problem, readBody, throttled } from "@/lib/http";
import { pollIsOpen, type Poll } from "@/lib/polls/shared";
import { getGroupPoll, voteInGroupPoll } from "@/lib/groups/polls";
import { getThread } from "@/lib/groups/store";
import { readVoteToken, type VoteClaim } from "@/lib/groups/tokens";

export const dynamic = "force-dynamic";

/**
 * A poll's one-click answer link from an email (`/vote/<token>`): the signed
 * token names who, which poll, and which answer. Looking (GET) never
 * records anything — mail scanners open every link — the page records it
 * with a POST: at once when you're signed in as that person, otherwise when
 * you press "Confirm my answer". No sign-in is needed: the link, sent only
 * to that member, is the proof. Answering again changes the answer.
 */

async function load(claim: VoteClaim) {
  const [directory, doc, poll] = await Promise.all([
    readDirectory(),
    getThread(claim.circleId, claim.threadId),
    getGroupPoll(claim.circleId, claim.threadId),
  ]);
  const circle = directory?.circles.find((entry) => entry.id === claim.circleId);
  const person = directory?.people.find((entry) => entry.id === claim.personId);
  const option = poll?.poll.options.find((entry) => entry.id === claim.optionId);
  if (!directory || !circle || !person || !doc || !poll || !option) return null;
  return { directory, circle, person, doc, poll, option };
}

const results = (poll: Poll, personId: string) => ({
  options: poll.options.map((option) => ({
    id: option.id,
    text: option.text,
    votes: poll.votes.filter((vote) => vote.optionIds.includes(option.id)).length,
  })),
  voters: poll.votes.length,
  mine: poll.votes.find((vote) => vote.userId === personId)?.optionIds ?? [],
  open: pollIsOpen(poll),
});

export async function GET(request: NextRequest) {
  const limited = throttled(request, "vote-link");
  if (limited) return limited;
  const claim = readVoteToken(request.nextUrl.searchParams.get("token") ?? "");
  if (!claim) return problem("That link doesn't work", 400);
  const found = await load(claim);
  if (!found) return problem("That poll is no longer available", 404);
  const user = await getSessionUser().catch(() => null);
  return NextResponse.json(
    {
      question: found.doc.thread.title,
      circleName: found.circle.name,
      optionText: found.option.text,
      voterName: found.person.displayName,
      url: `/circles/${found.circle.id}/forum/${found.doc.thread.id}`,
      signedInAs: user?.personId === claim.personId ? "voter" : user ? "someone-else" : null,
      ...results(found.poll.poll, claim.personId),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const schema = z.object({ token: z.string().max(600) });

export async function POST(request: NextRequest) {
  const limited = throttled(request, "vote-link");
  if (limited) return limited;
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const claim = readVoteToken(parsed.data.token);
  if (!claim) return problem("That link doesn't work", 400);
  const found = await load(claim);
  if (!found) return problem("That poll is no longer available", 404);
  if (!canManageCircle(found.directory, claim.circleId, claim.personId))
    return problem(`Only ${found.circle.name}'s members answer this poll`, 403);
  if (!pollIsOpen(found.poll.poll)) return problem("This poll has closed", 409);
  const current =
    found.poll.poll.votes.find((vote) => vote.userId === claim.personId)?.optionIds ?? [];
  const choice = found.poll.poll.multiple
    ? Array.from(new Set([...current, claim.optionId]))
    : [claim.optionId];
  const result = await voteInGroupPoll(
    claim.circleId,
    claim.threadId,
    { personId: claim.personId, name: found.person.displayName },
    choice
  );
  if (typeof result === "string") return problem("Your answer couldn't be saved", 409);
  return NextResponse.json(results(result.poll, claim.personId));
}
