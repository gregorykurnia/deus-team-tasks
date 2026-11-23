import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const leaveClockFile = resolve("test-results", ".leave-test-date");

export async function pinLeaveDate(day: string) {
  const next = `${leaveClockFile}.next`;
  await mkdir(dirname(leaveClockFile), { recursive: true });
  await writeFile(next, day);
  await rename(next, leaveClockFile);
}

export async function resetLeaveDate() {
  await rm(leaveClockFile, { force: true });
}
