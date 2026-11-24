// Crawlers that run the app's JavaScript. Each visit opens the live task lists with no saved copy, so it reads every
// task from the database. On 2026-11-23 these two loaded the app about 6,000 times and used up the day's free reads.
// robots.txt (app/robots.ts) asks every crawler to stay out; proxy.ts turns these away even if they don't listen.
const RENDERING_CRAWLERS = /HeadlessChrome|Reflectionbot/i;

export function isRenderingCrawler(userAgent: string | null): boolean {
  return !!userAgent && RENDERING_CRAWLERS.test(userAgent);
}
