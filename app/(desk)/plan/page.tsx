import { Suspense } from "react";
import PageHeader from "@/desk/PageHeader";
import PlanScreen from "@/features/plan/PlanScreen";

// The screen reads its view from the address, which only the browser knows: the server renders the title.
export default function Page() {
  return (
    <Suspense fallback={<PageHeader title="Plan" />}>
      <PlanScreen />
    </Suspense>
  );
}
