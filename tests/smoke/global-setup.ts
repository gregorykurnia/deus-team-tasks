import { openClientTrackerRules } from "../support/emulator";

export default async function globalSetup() {
  await openClientTrackerRules();
}
