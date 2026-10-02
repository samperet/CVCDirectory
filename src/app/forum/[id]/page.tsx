import { ThreadClient } from "@/components/forum/thread-client";

export const metadata = { title: "Discussion · Common Pastures" };

export default function ThreadPage({ params }: { params: { id: string } }) {
  return <ThreadClient id={params.id} />;
}
