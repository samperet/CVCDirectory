import { ThreadClient } from "@/components/forum/thread-client";

export const metadata = { title: "Discussion · CVC Directory" };

export default function ThreadPage({ params }: { params: { id: string } }) {
  return <ThreadClient id={params.id} />;
}
