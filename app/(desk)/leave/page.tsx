import { Suspense } from "react";
import { notFound } from "next/navigation";
import PageHeader from "@/desk/PageHeader";
import LeaveScreen, { LeaveLoading } from "@/features/leave/LeaveScreen";
import { leaveEnabled } from "@/lib/flags";

export default function LeavePage() {
  if (!leaveEnabled()) notFound();
  return (
    <>
      <PageHeader title="Leave" connectionBanner={false} />
      <Suspense fallback={<LeaveLoading />}><LeaveScreen /></Suspense>
    </>
  );
}
