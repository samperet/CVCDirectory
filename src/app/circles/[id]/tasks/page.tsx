import { TaskBoardClient } from "@/components/tasks/task-board";

export const metadata = { title: "Tasks · Common Pastures" };

export default function TaskBoardPage({ params }: { params: { id: string } }) {
  return <TaskBoardClient circleId={params.id} />;
}
