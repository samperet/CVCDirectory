import { TopicClient } from "@/components/forum/topic-client";

export const metadata = { title: "Forum · CVC Directory" };

export default function TopicPage({ params }: { params: { topicId: string } }) {
  return <TopicClient topicId={params.topicId} />;
}
