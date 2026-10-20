import { Suspense } from "react";
import { BackOnlineToast } from "@/desk/ConnectionBanner";
import { DeskData } from "@/desk/DeskData";
import ManyChangesToast from "@/desk/ManyChangesToast";
import MoreSheet from "@/desk/MoreSheet";
import SideNav from "@/desk/SideNav";
import { ToasterProvider } from "@/ui/Toaster";
import TabBar from "@/desk/TabBar";
import InstallHost from "@/features/install/InstallHost";
import TaskSheetHost from "@/features/task-sheet/TaskSheetHost";
import styles from "@/desk/DeskShell.module.css";

// The app's shell: the data every screen reads, the side bar or tab bar, and More.
export default function DeskLayout({ children }: LayoutProps<"/">) {
  return (
    <DeskData>
      <ToasterProvider>
        <div className={styles.app}>
          <SideNav />
          <main className={styles.main}>{children}</main>
        </div>
        <TabBar />
        {/* More and task details read the address, so they render in the browser only. */}
        <Suspense fallback={null}>
          <MoreSheet />
        </Suspense>
        <Suspense fallback={null}>
          <TaskSheetHost />
        </Suspense>
        <Suspense fallback={null}>
          <InstallHost />
        </Suspense>
        <BackOnlineToast />
        <ManyChangesToast />
      </ToasterProvider>
    </DeskData>
  );
}
