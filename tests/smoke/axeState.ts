import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const selection = process.env.LEAVE_PLAN_AXE ? new RegExp(process.env.LEAVE_PLAN_AXE) : null;

export function auditsState(state: string) {
  return selection?.test(state) ?? false;
}

export async function auditState(page: Page, state: string) {
  if (!auditsState(state)) return;
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (!document.getElementById("axe-hide-dev-tools")) {
      const style = document.createElement("style");
      style.id = "axe-hide-dev-tools";
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    }
    const dialogs = document.querySelectorAll('[aria-modal="true"]');
    await Promise.all(Array.from(dialogs).flatMap((dialog) => dialog.getAnimations()).map((animation) => animation.finished.catch(() => {})));
  });
  const result = await new AxeBuilder({ page }).withTags(tags).analyze();
  const violations = result.violations.flatMap(({ id, nodes }) => nodes
    .filter((node) => id !== "scrollable-region-focusable" || !node.html.includes("data-keys-via-input"))
    .map((node) => ({ rule: id, target: node.target, detail: node.failureSummary })));
  const checkpoint = `${state}@${page.viewportSize()?.width}`;
  console.log(`AXE ${JSON.stringify({ checkpoint, violations })}`);
  expect.soft(violations, checkpoint).toEqual([]);
}
