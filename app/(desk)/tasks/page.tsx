import PageHeader from "@/desk/PageHeader";

export default function Page() {
  return <PageHeader title="Tasks" action={{ label: "New task", href: "/tasks?task=new", newTask: true }} />;
}
