import { CircleDetailClient } from "@/components/circles/circle-detail-client";

export const metadata = { title: "Circle | Community Village Cooperative Directory" };

export default function CirclePage({ params }: { params: { id: string } }) {
  return <CircleDetailClient id={params.id} />;
}
