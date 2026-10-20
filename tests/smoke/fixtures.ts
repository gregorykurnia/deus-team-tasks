import { test as base, expect } from "@playwright/test";
import { clearAll } from "../support/emulator";
import { mockCalendar, type CalendarMode, type MockEvent } from "../support/calendar";

type Fixtures = {
  // Every test starts on empty data, with the team calendar switched off.
  cleanData: void;
  calendar: (mode: CalendarMode, events?: MockEvent[]) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  cleanData: [
    async ({ page }, use) => {
      await clearAll();
      await mockCalendar(page, "off");
      await use();
    },
    { auto: true },
  ],
  calendar: async ({ page }, use) => {
    await use(async (mode, events) => {
      await page.unroute("**/api/calendar?**");
      await mockCalendar(page, mode, events);
    });
  },
});

export { expect };
