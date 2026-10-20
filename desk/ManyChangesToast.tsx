"use client";

// A lot of a colleague's changes at once (A1, guide 3): one toast says so. The design names the colleague, but nobody
// signs in, so the app can't know who it was (N2): the toast says "A colleague’s changes just came in".
import { useEffect } from "react";
import { onManyChanges } from "@/lib/liveChanges";
import { useToast } from "@/ui/Toaster";

export default function ManyChangesToast() {
  const toast = useToast();
  useEffect(() => onManyChanges(() => toast("A colleague’s changes just came in")), [toast]);
  return null;
}
