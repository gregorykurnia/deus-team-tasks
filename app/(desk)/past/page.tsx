import { Suspense } from "react";
import PageHeader from "@/desk/PageHeader";
import PastScreen from "@/features/past/PastScreen";

// The screen reads its view from the address, which only the browser knows: the server renders the title.
export default function Page() {
  return (
    <Suspense fallback={<PageHeader title="Past clients" />}>
      <PastScreen />
    </Suspense>
  );
}
