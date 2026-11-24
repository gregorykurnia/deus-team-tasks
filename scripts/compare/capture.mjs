import { devices } from "@playwright/test";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export function captureUserAgent(iphone) {
  return iphone ? IPHONE : devices["Desktop Chrome"].userAgent;
}

export async function openCapturePage(page, url) {
  try {
    const response = await page.goto(url);
    if (!response) throw new Error(`Opening ${url} returned no HTTP response`);
    if (!response.ok()) throw new Error(`Opening ${url} returned HTTP ${response.status()}`);
  } catch (error) {
    await page.context().close();
    throw error;
  }
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ path: string, style?: string, fullPage?: boolean }} options
 */
export async function takePageShot(page, { fullPage = false, ...options }) {
  const viewport = page.viewportSize();
  if (!fullPage || !viewport) return page.screenshot({ ...options, animations: "disabled" });

  const contentHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  const height = Math.min(Math.max(contentHeight, viewport.height), 1800);
  // Chromium only paints fixed layers inside the viewport, even in a full-page screenshot.
  if (height !== viewport.height) await page.setViewportSize({ width: viewport.width, height });
  try {
    return await page.screenshot({
      ...options,
      animations: "disabled",
      fullPage: true,
      clip: { x: 0, y: 0, width: viewport.width, height },
    });
  } finally {
    if (height !== viewport.height) await page.setViewportSize(viewport);
  }
}

export function captureFailed(state) {
  return Boolean(state.failed || state.errors?.length);
}
