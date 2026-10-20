"use client";

// One task group (guide 6.2): the same screen as All tasks, narrowed to the group named in the address.
import { useParams } from "next/navigation";
import PageHeader from "@/desk/PageHeader";
import { Suspense } from "react";
import TasksScreen from "./TasksScreen";

export default function GroupScreen() {
  const { groupId } = useParams<{ groupId: string }>();
  return (
    <Suspense fallback={<PageHeader title="Task group" />}>
      <TasksScreen groupId={groupId} />
    </Suspense>
  );
}
