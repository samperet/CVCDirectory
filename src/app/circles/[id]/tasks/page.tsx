import { TaskBoardClient } from "@/components/tasks/task-board";

export const metadata = { title: "Tasks · CVC Directory" };

export default function TaskBoardPage({ params }: { params: { id: string } }) {
  return <TaskBoardClient circleId={params.id} />;
}
