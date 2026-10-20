"use client";

// One task group (guide 6.2). Task 3.3 fills in its tasks and its menu.
import { useParams } from "next/navigation";
import { useTaskGroups } from "@/desk/DeskData";
import PageHeader from "@/desk/PageHeader";

export default function GroupScreen() {
  const { groupId } = useParams<{ groupId: string }>();
  const groups = useTaskGroups();
  const group = groups.rows.find((g) => g.id === decodeURIComponent(groupId));
  return <PageHeader title={group?.name ?? "Task group"} />;
}
