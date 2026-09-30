import { notFound } from "next/navigation";
import { TaskPageClient } from "@/components/tasks/task-page";

export const metadata = { title: "Task · CVC Directory" };

export default function TaskPage({ params }: { params: { id: string; number: string } }) {
  if (!/^\d{1,6}$/.test(params.number)) notFound();
  return <TaskPageClient circleId={params.id} number={Number(params.number)} />;
}
