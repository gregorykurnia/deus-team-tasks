import { Suspense } from "react";
import { notFound } from "next/navigation";
import { signInEnabled } from "@/lib/flags";
import SignInPage from "@/features/sign-in/SignInPage";

export default function Page() {
  if (!signInEnabled()) notFound();
  return <Suspense><SignInPage /></Suspense>;
}
