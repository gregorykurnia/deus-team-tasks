import { EMULATOR_HOST, openClientTrackerRules } from "../support/emulator";

// Pure tests don't need the emulator. When it's running (npm run test:unit),
// open the client tracker's rules once for the tests that write data.
export default async function globalSetup() {
  try {
    await fetch(`http://${EMULATOR_HOST}/`);
  } catch {
    return;
  }
  await openClientTrackerRules();
}
