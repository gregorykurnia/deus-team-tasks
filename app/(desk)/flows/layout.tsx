import { Suspense, type ReactNode } from "react";
import PageHeader from "@/desk/PageHeader";
import FlowsScreen from "@/features/flows/FlowsScreen";

// The list and the open flow are one screen, kept across /flows and /flows/<id>, so choosing a flow doesn't start the
// screen over. It reads the address, which only the browser knows: the server renders the title.
export default function FlowsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<PageHeader title="Flows" />}>
        <FlowsScreen />
      </Suspense>
      {children}
    </>
  );
}
