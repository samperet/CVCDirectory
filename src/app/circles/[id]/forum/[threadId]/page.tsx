import { GroupThreadClient } from "@/components/groups/thread-client";

export const metadata = { title: "Conversation · Common Pastures" };

export default function GroupThreadPage({ params }: { params: { id: string; threadId: string } }) {
  return <GroupThreadClient circleId={params.id} threadId={params.threadId} />;
}
