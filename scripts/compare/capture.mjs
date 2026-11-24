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

export function captureFailed(state) {
  return Boolean(state.failed || state.errors?.length);
}
