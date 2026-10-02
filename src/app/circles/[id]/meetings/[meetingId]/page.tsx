import { notFound } from "next/navigation";
import { MinutesMaker } from "@/components/meetings/minutes-maker";

export const metadata = { title: "Minutes · Common Pastures" };

export default function MeetingPage({ params }: { params: { id: string; meetingId: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.meetingId)) notFound();
  return <MinutesMaker circleId={params.id} meetingId={params.meetingId} />;
}
