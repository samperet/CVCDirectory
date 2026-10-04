import { VoteClient } from "@/components/groups/vote-client";

export const metadata = { title: "Your answer · Common Pastures" };

/** A poll's one-click answer link from an email (works without signing in; see /api/polls/vote-link). */
export default function VotePage({ params }: { params: { token: string } }) {
  return <VoteClient token={params.token} />;
}
