"use client";

// Something that opens over a screen from the address (?newGroup=1), so a reload keeps it and the phone's back gesture
// closes it. Opened from inside the app, closing steps back, so back doesn't open it again; opened by a reload or a
// shared link, closing takes the param off instead. (Task details do the same in features/task-sheet/TaskSheetHost.)
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { without } from "./areas";

export function useOverParam(name: string): { open: boolean; close: () => void } {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const open = search.has(name);

  const pushed = useRef(false);
  const seen = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (seen.current !== undefined && open && !seen.current) pushed.current = true;
    if (!open) pushed.current = false;
    seen.current = open;
  }, [open]);

  const close = useCallback(() => {
    if (!open) return;
    const back = pushed.current;
    pushed.current = false;
    if (back) router.back();
    else router.replace(without(pathname, search, [name]), { scroll: false });
  }, [open, router, pathname, search, name]);

  return { open, close };
}
