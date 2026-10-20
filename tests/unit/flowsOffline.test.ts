// A change to a flow made on the newest version (changeFlow) is refused with no connection (A3, D-018), before anything
// reaches Firestore.
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { OfflineError, resetConnection } from "@/lib/connection";
import { changeFlow } from "@/lib/flowWrites";

afterEach(() => {
  vi.unstubAllGlobals();
  resetConnection();
});

afterAll(async () => {
  await terminate(db);
});

it("refuses a change to a flow with no connection, and says what wasn't saved", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const change = vi.fn((f) => f);
  await expect(changeFlow("x", change)).rejects.toEqual(new OfflineError("No connection. The flow wasn't saved."));
  expect(change).not.toHaveBeenCalled();
});
