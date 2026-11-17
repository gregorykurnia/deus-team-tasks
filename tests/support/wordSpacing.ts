import { expect, type Locator } from "@playwright/test";

// Measure rendered spaces, including inherited styles and the actual loaded font.
// Spaces discarded at a line break don't count as gaps between words on one line.
export async function expectWordGaps(elements: Locator, minimum = 4) {
  for (const element of await elements.all()) {
    const result = await element.evaluate((root) => {
      const widths: number[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.textContent!.matchAll(/ +/g)) {
          const range = document.createRange();
          range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) widths.push(rect.width);
        }
      }
      return { text: root.textContent?.trim(), widths };
    });
    if (!/\S +\S/.test(result.text || "")) continue;
    expect(Math.min(...(result.widths.length ? result.widths : [0])), `word gaps in “${result.text}”`).toBeGreaterThanOrEqual(minimum);
  }
}
