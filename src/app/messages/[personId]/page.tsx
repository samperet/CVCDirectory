import { MessagesClient } from "@/components/chat/messages-client";

export const metadata = { title: "Messages · Common Pastures" };

/** A conversation with someone (by directory person id). */
export default function ConversationPage({ params }: { params: { personId: string } }) {
  return <MessagesClient personId={params.personId} />;
}
