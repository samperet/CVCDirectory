import { MeetingsListClient } from "@/components/meetings/meetings-list";

export const metadata = { title: "Meetings · Common Pastures" };

export default function MeetingsPage({ params }: { params: { id: string } }) {
  return <MeetingsListClient circleId={params.id} />;
}
